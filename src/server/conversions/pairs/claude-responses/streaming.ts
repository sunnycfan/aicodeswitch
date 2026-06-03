/**
 * OpenAI Responses API SSE → Claude Messages SSE streaming conversion.
 *
 * Stateful converter that processes SSE events from an OpenAI Responses API
 * upstream and emits Claude Messages SSE events.
 */

import type { SSEEvent, StreamConverter } from '../../types.js';
import { generateMessageId, generateCallId } from '../../utils/id.js';
import { responsesToClaudeStopReason } from '../../utils/stop-reasons.js';
import { responsesToClaudeUsage } from '../../utils/usage.js';
import { parseEventData } from '../../utils/streaming-helpers.js';

/**
 * Stateful converter: Responses API SSE → Claude Messages SSE.
 */
export class ResponsesToClaudeConverter implements StreamConverter {
  private started = false;
  private messageStopped = false;
  private currentBlockType: null | 'thinking' | 'text' = null;
  private currentBlockIndex = -1;
  private nextBlockIndex = 0;
  private messageId = generateMessageId();
  private model = '';

  convertEvent(event: SSEEvent): SSEEvent[] {
    if (!event.data) return [];

    const eventName = event.event;
    const events: SSEEvent[] = [];

    try {
      const data = parseEventData(event.data);

      switch (eventName) {
        case 'response.created': {
          this.model = data.model || '';
          this.started = false;
          this.messageStopped = false;
          // Will emit message_start when we get actual content
          break;
        }

        case 'response.output_item.added': {
          const item = data.item || data;
          if (item.type === 'function_call') {
            this.ensureStarted(events, data.model);
            this.closeCurrentBlock(events);
            // Open tool_use block
            const idx = this.nextBlockIndex++;
            events.push(this.makeSSE('content_block_start', {
              type: 'content_block_start',
              index: idx,
              content_block: {
                type: 'tool_use',
                id: item.call_id || generateCallId(),
                name: item.name || '',
                input: {},
              },
            }));
            this.currentBlockIndex = idx;
            this.currentBlockType = null; // tool_use is not tracked as a "block type" for closing
          }
          break;
        }

        case 'response.content_part.added': {
          const part = data.part || data;
          if (part.type === 'output_text') {
            this.ensureStarted(events, data.model);
            if (this.currentBlockType !== 'text') {
              this.closeCurrentBlock(events);
              this.openTextBlock(events);
            }
          }
          break;
        }

        case 'response.output_text.delta': {
          this.ensureStarted(events, data.model);
          if (this.currentBlockType !== 'text') {
            this.closeCurrentBlock(events);
            this.openTextBlock(events);
          }
          const delta = data.delta || '';
          if (delta) {
            events.push(this.makeSSE('content_block_delta', {
              type: 'content_block_delta',
              index: this.currentBlockIndex,
              delta: { type: 'text_delta', text: delta },
            }));
          }
          break;
        }

        case 'response.output_text.done': {
          this.closeCurrentBlock(events);
          break;
        }

        case 'response.reasoning.delta':
        case 'response.reasoning_summary_text.delta': {
          this.ensureStarted(events, data.model);
          const text = data.delta || data.text || '';
          if (!text) break;
          if (this.currentBlockType !== 'thinking') {
            this.closeCurrentBlock(events);
            this.openThinkingBlock(events);
          }
          events.push(this.makeSSE('content_block_delta', {
            type: 'content_block_delta',
            index: this.currentBlockIndex,
            delta: { type: 'thinking_delta', thinking: text },
          }));
          break;
        }

        case 'response.reasoning.done': {
          this.closeCurrentBlock(events);
          break;
        }

        case 'response.function_call_arguments.delta': {
          const argDelta = data.delta || '';
          if (argDelta) {
            events.push(this.makeSSE('content_block_delta', {
              type: 'content_block_delta',
              index: this.currentBlockIndex,
              delta: { type: 'input_json_delta', partial_json: argDelta },
            }));
          }
          break;
        }

        case 'response.function_call_arguments.done': {
          // Close the tool_use block
          if (this.currentBlockIndex >= 0 && this.currentBlockType === null) {
            events.push(this.makeSSE('content_block_stop', {
              type: 'content_block_stop',
              index: this.currentBlockIndex,
            }));
            this.currentBlockIndex = -1;
            this.currentBlockType = null;
          }
          break;
        }

        case 'response.completed': {
          this.closeCurrentBlock(events);

          if (this.started && !this.messageStopped) {
            const responseData = data.response || data;
            const stopReason = responsesToClaudeStopReason(
              responseData.status,
              responseData.incomplete_details?.reason,
              true, // will be refined if needed
            );
            const usage = responsesToClaudeUsage(responseData.usage);

            events.push(this.makeSSE('message_delta', {
              type: 'message_delta',
              delta: { stop_reason: stopReason, stop_sequence: null },
              usage,
            }));
            events.push(this.makeSSE('message_stop', {
              type: 'message_stop',
            }));
            this.messageStopped = true;
          }
          break;
        }

        // Skip these events
        case 'response.in_progress':
        case 'response.output_item.done':
        case 'response.content_part.done':
        case 'response.reasoning_summary_part.added':
        case 'response.reasoning_summary_part.done':
          break;

        default:
          break;
      }
    } catch {
      // Ignore parse errors
    }

    return events;
  }

  private ensureStarted(events: SSEEvent[], model?: string): void {
    if (this.started) return;
    if (model) this.model = model;
    events.push(this.makeSSE('message_start', {
      type: 'message_start',
      message: {
        id: this.messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model: this.model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    }));
    this.started = true;
  }

  private openTextBlock(events: SSEEvent[]): void {
    const idx = this.nextBlockIndex++;
    events.push(this.makeSSE('content_block_start', {
      type: 'content_block_start',
      index: idx,
      content_block: { type: 'text', text: '' },
    }));
    this.currentBlockIndex = idx;
    this.currentBlockType = 'text';
  }

  private openThinkingBlock(events: SSEEvent[]): void {
    const idx = this.nextBlockIndex++;
    events.push(this.makeSSE('content_block_start', {
      type: 'content_block_start',
      index: idx,
      content_block: { type: 'thinking', thinking: '' },
    }));
    this.currentBlockIndex = idx;
    this.currentBlockType = 'thinking';
  }

  private closeCurrentBlock(events: SSEEvent[]): void {
    if (this.currentBlockType !== null && this.currentBlockIndex >= 0) {
      events.push(this.makeSSE('content_block_stop', {
        type: 'content_block_stop',
        index: this.currentBlockIndex,
      }));
      this.currentBlockType = null;
      this.currentBlockIndex = -1;
    }
  }

  private makeSSE(claudeEventType: string, data: any): SSEEvent {
    return {
      event: claudeEventType,
      data,
    };
  }
}
