/**
 * Gemini SSE → Claude Messages SSE streaming conversion.
 *
 * Stateful converter that transforms Gemini streaming chunks into Claude SSE events.
 * Gemini streams using cumulative snapshots (each chunk contains the full text so
 * far), so the converter must track the previously-seen text and emit only the diff
 * as `text_delta` events in the Claude protocol.
 */

import type { SSEEvent, StreamConverter } from '../../types.js';
import { geminiToClaudeStopReason } from '../../utils/stop-reasons.js';
import { generateMessageId, generateToolUseId } from '../../utils/id.js';
import { parseEventData } from '../../utils/streaming-helpers.js';

/**
 * Stateful converter: Gemini SSE → Claude Messages SSE.
 */
export class GeminiToClaudeConverter implements StreamConverter {
  private started = false;
  private messageStopped = false;
  private currentBlockType: null | 'text' = null;
  private currentBlockIndex = -1;
  private nextBlockIndex = 0;
  private outputTokens = 0;
  private messageId = generateMessageId();
  private previousText = '';

  convertEvent(event: SSEEvent): SSEEvent[] {
    // [DONE] passthrough
    if (!event.data || event.data === '[DONE]' || event.data?.type === 'done') {
      return [{ data: '[DONE]', event: event.event }];
    }

    try {
      const chunk = parseEventData(event.data);
      const events: any[] = [];
      const candidates = chunk.candidates || [];
      const usage = chunk.usageMetadata || {};

      if (usage.candidatesTokenCount) {
        this.outputTokens = usage.candidatesTokenCount;
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
            model: chunk.modelVersion || '',
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        });
        this.started = true;
      }

      for (const candidate of candidates) {
        const parts = candidate.content?.parts || [];

        for (const part of parts) {
          // Text part — handle cumulative snapshots via diffing
          if (!this.messageStopped && part.text !== undefined && part.text !== null) {
            const diff = part.text.substring(this.previousText.length);
            this.previousText = part.text;

            if (diff) {
              this.ensureTextBlock(events);
              events.push({
                type: 'content_block_delta',
                index: this.currentBlockIndex,
                delta: { type: 'text_delta', text: diff },
              });
            }
          }

          // Function call — close text block first, then emit complete tool_use block
          if (!this.messageStopped && part.functionCall) {
            this.closeTextBlock(events);
            emitToolUseBlock(events, {
              index: this.nextBlockIndex++,
              id: generateToolUseId(),
              name: part.functionCall.name || '',
              inputJson: JSON.stringify(part.functionCall.args ?? {}),
            });
          }
        }

        // Finish reason → close and finalize
        if (candidate.finishReason && !this.messageStopped) {
          this.closeTextBlock(events);
          events.push({
            type: 'message_delta',
            delta: {
              stop_reason: geminiToClaudeStopReason(candidate.finishReason),
              stop_sequence: null,
            },
            usage: { output_tokens: this.outputTokens },
          });
          events.push({ type: 'message_stop' });
          this.messageStopped = true;
        }
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

  // --- Helpers --------------------------------------------------------------

  private ensureTextBlock(events: any[]): void {
    if (this.currentBlockType === 'text' && this.currentBlockIndex >= 0) return;

    this.currentBlockIndex = this.nextBlockIndex++;
    this.currentBlockType = 'text';
    events.push({
      type: 'content_block_start',
      index: this.currentBlockIndex,
      content_block: { type: 'text', text: '' },
    });
  }

  private closeTextBlock(events: any[]): void {
    if (this.currentBlockType === 'text' && this.currentBlockIndex >= 0) {
      events.push({ type: 'content_block_stop', index: this.currentBlockIndex });
      this.currentBlockType = null;
      this.currentBlockIndex = -1;
    }
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Emit a complete tool_use block (start + delta + stop) into the events array.
 */
function emitToolUseBlock(
  events: any[],
  tool: { index: number; id: string; name: string; inputJson: string },
): void {
  events.push({
    type: 'content_block_start',
    index: tool.index,
    content_block: {
      type: 'tool_use',
      id: tool.id,
      name: tool.name,
      input: {},
    },
  });

  if (tool.inputJson) {
    events.push({
      type: 'content_block_delta',
      index: tool.index,
      delta: { type: 'input_json_delta', partial_json: tool.inputJson },
    });
  }

  events.push({ type: 'content_block_stop', index: tool.index });
}
