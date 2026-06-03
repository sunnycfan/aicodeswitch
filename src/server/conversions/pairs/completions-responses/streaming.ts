/**
 * OpenAI Responses API → OpenAI Chat Completions streaming conversion.
 *
 * Stateless converter that processes Responses API SSE events and produces
 * Chat Completions SSE chunks.
 */

import type { SSEEvent, StreamConverter } from '../../types.js';
import {
  responsesToCompletionsFinishReason,
} from '../../utils/stop-reasons.js';
import { generateCompletionsId } from '../../utils/id.js';
import { parseEventData } from '../../utils/streaming-helpers.js';

/**
 * Convert Responses API SSE events into Chat Completions SSE chunks.
 */
export class ResponsesToCompletionsConverter implements StreamConverter {
  private chatId = generateCompletionsId();
  private model = '';

  convertEvent(event: SSEEvent): SSEEvent[] {
    if (!event.data) return [];
    if (event.data === '[DONE]' || event.data?.type === 'done') {
      return [{ data: '[DONE]', event: '' }];
    }

    try {
      const eventName = event.event;
      const parsed = parseEventData(event.data);
      const chunks: SSEEvent[] = [];

      switch (eventName) {
        case 'response.created': {
          // First chunk with id, model
          this.chatId = parsed.id?.startsWith('chatcmpl-') ? parsed.id : generateCompletionsId();
          this.model = parsed.model || '';
          chunks.push({
            event: '',
            data: {
              id: this.chatId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: this.model,
              choices: [{
                index: 0,
                delta: { role: 'assistant', content: '' },
                finish_reason: null,
              }],
            },
          });
          break;
        }

        case 'response.output_text.delta': {
          // Text content delta
          chunks.push({
            event: '',
            data: {
              id: this.chatId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: this.model,
              choices: [{
                index: 0,
                delta: { content: parsed.text || '' },
                finish_reason: null,
              }],
            },
          });
          break;
        }

        case 'response.reasoning.delta':
        case 'response.reasoning_summary_text.delta': {
          // Reasoning content delta
          const text = parsed.text || parsed.delta || '';
          if (text) {
            chunks.push({
              event: '',
              data: {
                id: this.chatId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: this.model,
                choices: [{
                  index: 0,
                  delta: { reasoning_content: text },
                  finish_reason: null,
                }],
              },
            });
          }
          break;
        }

        case 'response.output_item.added': {
          // function_call added
          if (parsed.type === 'function_call') {
            chunks.push({
              event: '',
              data: {
                id: this.chatId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: this.model,
                choices: [{
                  index: 0,
                  delta: {
                    tool_calls: [{
                      id: parsed.call_id || parsed.id,
                      type: 'function',
                      function: {
                        name: parsed.name || '',
                        arguments: '',
                      },
                    }],
                  },
                  finish_reason: null,
                }],
              },
            });
          }
          break;
        }

        case 'response.function_call_arguments.delta': {
          // Function call arguments fragment
          const argsDelta = parsed.delta || '';
          if (argsDelta) {
            chunks.push({
              event: '',
              data: {
                id: this.chatId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: this.model,
                choices: [{
                  index: 0,
                  delta: {
                    tool_calls: [{
                      function: { arguments: argsDelta },
                    }],
                  },
                  finish_reason: null,
                }],
              },
            });
          }
          break;
        }

        case 'response.completed': {
          // Final chunk with finish_reason and usage
          const finishReason = responsesToCompletionsFinishReason(parsed.status);
          const usage = parsed.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
          chunks.push({
            event: '',
            data: {
              id: this.chatId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: this.model || parsed.model || '',
              choices: [{
                index: 0,
                delta: {},
                finish_reason: finishReason,
              }],
              usage,
            },
          });
          break;
        }

        // Events not mapped to Chat format: silently skip
        default:
          break;
      }

      return chunks;
    } catch {
      return [event];
    }
  }
}
