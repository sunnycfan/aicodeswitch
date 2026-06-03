/**
 * Claude Messages → OpenAI Chat Completions streaming conversion.
 *
 * Stateless converter that processes Claude SSE events and produces
 * OpenAI Chat Completions SSE chunks.
 */

import type { SSEEvent, StreamConverter } from '../../types.js';
import { claudeToCompletionsStopReason } from '../../utils/stop-reasons.js';
import { generateCompletionsId } from '../../utils/id.js';
import { parseEventData } from '../../utils/streaming-helpers.js';

/**
 * Convert Claude Messages SSE events into OpenAI Chat Completions SSE chunks.
 */
export class ClaudeToCompletionsConverter implements StreamConverter {
  convertEvent(event: SSEEvent): SSEEvent[] {
    if (!event.data || event.data === '[DONE]' || event.data?.type === 'done') {
      return [{ data: '[DONE]', event: '' }];
    }

    try {
      const parsed = parseEventData(event.data);
      const chunks: any[] = [];

      switch (parsed.type) {
        case 'message_start': {
          chunks.push({
            id: parsed.message?.id || generateCompletionsId(),
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: parsed.message?.model || '',
            choices: [
              {
                index: 0,
                delta: { role: 'assistant', content: '' },
                finish_reason: null,
              },
            ],
          });
          break;
        }

        case 'content_block_start': {
          if (parsed.content_block?.type === 'tool_use') {
            chunks.push({
              id: generateCompletionsId(),
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: '',
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index: parsed.index || 0,
                        id: parsed.content_block.id,
                        type: 'function',
                        function: {
                          name: parsed.content_block.name || '',
                          arguments: '',
                        },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            });
          }
          // text and thinking blocks do not emit on start — deltas follow
          break;
        }

        case 'content_block_delta': {
          if (parsed.delta?.type === 'thinking_delta') {
            // thinking delta → reasoning_content
            chunks.push({
              id: generateCompletionsId(),
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: '',
              choices: [
                {
                  index: 0,
                  delta: { reasoning_content: parsed.delta.thinking },
                  finish_reason: null,
                },
              ],
            });
          } else if (parsed.delta?.type === 'text_delta') {
            chunks.push({
              id: generateCompletionsId(),
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: '',
              choices: [
                {
                  index: 0,
                  delta: { content: parsed.delta.text },
                  finish_reason: null,
                },
              ],
            });
          } else if (parsed.delta?.type === 'input_json_delta') {
            chunks.push({
              id: generateCompletionsId(),
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: '',
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index: parsed.index || 0,
                        function: { arguments: parsed.delta.partial_json },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            });
          }
          break;
        }

        case 'message_delta': {
          const finishReason = claudeToCompletionsStopReason(parsed.delta?.stop_reason);
          chunks.push({
            id: generateCompletionsId(),
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: '',
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: finishReason,
              },
            ],
            usage: parsed.usage
              ? {
                  prompt_tokens: 0,
                  completion_tokens: parsed.usage.output_tokens || 0,
                  total_tokens: parsed.usage.output_tokens || 0,
                }
              : undefined,
          });
          break;
        }

        // message_stop, content_block_stop, ping — no OpenAI equivalent
        default:
          break;
      }

      // OpenAI SSE does not use named events (event: is empty string)
      return chunks.map((data) => ({ data, event: '' }));
    } catch {
      return [event];
    }
  }
}
