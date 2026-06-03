/**
 * OpenAI Chat Completions SSE → Claude Messages SSE streaming conversion.
 *
 * Stateful converter that processes SSE events from an OpenAI Chat Completions
 * upstream and emits Claude Messages SSE events, enhanced with reasoning_content /
 * thinking block support.
 */

import type { SSEEvent, StreamConverter } from '../../types.js';
import { completionsToClaudeStopReason } from '../../utils/stop-reasons.js';
import { generateMessageId, generateToolUseId } from '../../utils/id.js';
import { normalizeToolArgumentsFragment, parseEventData } from '../../utils/streaming-helpers.js';

/**
 * Stateful converter: OpenAI Chat SSE → Claude Messages SSE.
 */
export class CompletionsToClaudeConverter implements StreamConverter {
  private started = false;
  private messageStopped = false;

  /** Tracks which non-tool content block is currently open: null | 'thinking' | 'text' */
  private currentBlockType: null | 'thinking' | 'text' = null;
  /** Index of the currently open block; -1 when no block is open */
  private currentBlockIndex = -1;
  /** Monotonically increasing block index counter */
  private nextBlockIndex = 0;

  /** Accumulated tool calls keyed by their OpenAI index */
  private toolCalls = new Map<
    number,
    { id?: string; name?: string; argumentsText: string; order: number }
  >();
  private nextToolOrder = 0;

  private outputTokens = 0;
  private pendingStopReason: string | null = null;
  private messageId = generateMessageId();

  // ---- StreamConverter interface ------------------------------------------

  convertEvent(event: SSEEvent): SSEEvent[] {
    if (!event.data) return [];
    if (event.data === '[DONE]' || event.data?.type === 'done') return this.flush();

    try {
      const chunk = parseEventData(event.data);
      const events: any[] = [];
      const delta = chunk.choices?.[0]?.delta;
      const finishReason = chunk.choices?.[0]?.finish_reason;
      const messageToolCalls = chunk.choices?.[0]?.message?.tool_calls;
      const usage = chunk.usage;

      if (usage?.completion_tokens) {
        this.outputTokens = usage.completion_tokens;
      }

      // Emit message_start on first chunk
      if (!this.started) {
        events.push({
          type: 'message_start',
          message: {
            id: this.messageId,
            type: 'message',
            role: 'assistant',
            content: [],
            model: chunk.model || '',
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        });
        this.started = true;
      }

      // --- Reasoning content (NEW) ----------------------------------------
      if (!this.messageStopped && delta?.reasoning_content) {
        if (this.currentBlockType !== 'thinking') {
          this.closeCurrentBlock(events);
          this.openBlock(events, 'thinking');
        }
        events.push({
          type: 'content_block_delta',
          index: this.currentBlockIndex,
          delta: { type: 'thinking_delta', thinking: delta.reasoning_content },
        });
      }

      // --- Text content ---------------------------------------------------
      if (!this.messageStopped && delta?.content) {
        if (this.currentBlockType !== 'text') {
          this.closeCurrentBlock(events);
          this.openBlock(events, 'text');
        }
        events.push({
          type: 'content_block_delta',
          index: this.currentBlockIndex,
          delta: { type: 'text_delta', text: delta.content },
        });
      }

      // --- Tool calls (from delta) ----------------------------------------
      if (
        !this.messageStopped &&
        Array.isArray(delta?.tool_calls) &&
        delta.tool_calls.length > 0
      ) {
        this.closeCurrentBlock(events);
        this.captureToolCalls(delta.tool_calls);
      }

      // --- Tool calls (from message-level, some providers) ----------------
      if (
        !this.messageStopped &&
        Array.isArray(messageToolCalls) &&
        messageToolCalls.length > 0
      ) {
        this.closeCurrentBlock(events);
        this.captureToolCalls(messageToolCalls);
      }

      // --- Finish reason (dedup — skip if already set) --------------------
      if (finishReason && !this.messageStopped && this.pendingStopReason === null) {
        this.pendingStopReason = completionsToClaudeStopReason(finishReason);
      }

      return events.length > 0
        ? events.map((data) => ({
            data,
            event: data.type || event.event,
          }))
        : [];
    } catch {
      return [event];
    }
  }

  flush(): SSEEvent[] {
    if (this.messageStopped || !this.started) return [];

    const events: any[] = [];
    this.closeCurrentBlock(events);
    this.flushToolCalls(events);

    events.push({
      type: 'message_delta',
      delta: {
        stop_reason: this.pendingStopReason || 'end_turn',
        stop_sequence: null,
      },
      usage: { output_tokens: this.outputTokens },
    });
    events.push({ type: 'message_stop' });
    this.messageStopped = true;

    return events.map((data) => ({ data, event: data.type }));
  }

  // ---- Private helpers ---------------------------------------------------

  /** Open a new content block of the given type */
  private openBlock(events: any[], type: 'thinking' | 'text'): void {
    this.currentBlockIndex = this.nextBlockIndex++;
    this.currentBlockType = type;

    if (type === 'thinking') {
      events.push({
        type: 'content_block_start',
        index: this.currentBlockIndex,
        content_block: { type: 'thinking', thinking: '' },
      });
    } else {
      events.push({
        type: 'content_block_start',
        index: this.currentBlockIndex,
        content_block: { type: 'text', text: '' },
      });
    }
  }

  /** Close the currently open content block, if any */
  private closeCurrentBlock(events: any[]): void {
    if (this.currentBlockIndex >= 0) {
      events.push({ type: 'content_block_stop', index: this.currentBlockIndex });
      this.currentBlockIndex = -1;
      this.currentBlockType = null;
    }
  }

  /** Accumulate tool call fragments from delta */
  private captureToolCalls(toolCalls: any[]): void {
    for (const tc of toolCalls) {
      const toolIdx = tc.index ?? 0;
      const current = this.toolCalls.get(toolIdx) || {
        argumentsText: '',
        order: this.nextToolOrder++,
      };
      if (tc.id) current.id = tc.id;
      if (tc.function?.name) current.name = tc.function.name;
      const fragment = normalizeToolArgumentsFragment(tc.function?.arguments);
      if (fragment) current.argumentsText += fragment;
      this.toolCalls.set(toolIdx, current);
    }
  }

  /** Emit complete tool_use blocks for all accumulated tool calls */
  private flushToolCalls(events: any[]): void {
    const sorted = [...this.toolCalls.entries()].sort(
      (a, b) => a[1].order - b[1].order,
    );

    for (const [, toolCall] of sorted) {
      const idx = this.nextBlockIndex++;
      const id = toolCall.id || generateToolUseId();

      events.push({
        type: 'content_block_start',
        index: idx,
        content_block: { type: 'tool_use', id, name: toolCall.name || '', input: {} },
      });

      if (toolCall.argumentsText) {
        events.push({
          type: 'content_block_delta',
          index: idx,
          delta: { type: 'input_json_delta', partial_json: toolCall.argumentsText },
        });
      }

      events.push({ type: 'content_block_stop', index: idx });
    }

    this.toolCalls.clear();
  }
}
