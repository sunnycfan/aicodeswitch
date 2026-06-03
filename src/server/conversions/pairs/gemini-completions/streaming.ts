/**
 * OpenAI Chat Completions → Gemini generateContent streaming conversion.
 *
 * Stateful converter that processes Chat Completions SSE events and produces
 * Gemini SSE events.
 */

import type { SSEEvent, StreamConverter } from '../../types.js';
import { mapCompletionsFinishReason } from '../../utils/format-mappers.js';
import { parseEventData } from '../../utils/streaming-helpers.js';

/**
 * Convert Chat Completions SSE events into Gemini generateContent SSE events.
 *
 * Accumulates text content and tool calls, emitting cumulative Gemini snapshots.
 */
export class CompletionsToGeminiConverter implements StreamConverter {
  private started = false;
  private textContent = '';
  private toolCalls = new Map<number, { name: string; argumentsText: string }>();

  convertEvent(event: SSEEvent): SSEEvent[] {
    if (!event.data) return [];
    if (event.data === '[DONE]' || (typeof event.data === 'object' && event.data?.type === 'done')) return this.flush();

    try {
      const chunk = parseEventData(event.data);
      const delta = chunk.choices?.[0]?.delta;
      const finishReason = chunk.choices?.[0]?.finish_reason;
      const parts: any[] = [];

      // Text delta → accumulate and emit cumulative text
      if (delta?.content) {
        this.textContent += delta.content;
        parts.push({ text: this.textContent });
      }

      // Reasoning content → no Gemini equivalent, skip

      // Tool calls → accumulate arguments and emit functionCall
      if (Array.isArray(delta?.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const existing = this.toolCalls.get(idx);
          if (!existing && tc.function?.name) {
            this.toolCalls.set(idx, {
              name: tc.function.name,
              argumentsText: tc.function?.arguments || '',
            });
          } else if (existing && tc.function?.arguments) {
            existing.argumentsText += tc.function.arguments;
          }
        }

        // Emit accumulated tool calls as functionCall parts
        for (const [, tc] of this.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: JSON.parse(tc.argumentsText || '{}'),
            },
          });
        }
      }

      if (parts.length > 0 || !this.started) {
        const candidate: any = {
          content: { role: 'model', parts: parts.length > 0 ? parts : [{ text: '' }] },
        };

        if (finishReason) {
          candidate.finishReason = mapCompletionsFinishReason(finishReason);
        }

        const result: any = { candidates: [candidate] };
        if (chunk.usage) {
          result.usageMetadata = {
            promptTokenCount: chunk.usage.prompt_tokens ?? 0,
            candidatesTokenCount: chunk.usage.completion_tokens ?? 0,
            totalTokenCount: chunk.usage.total_tokens ?? 0,
          };
        }

        this.started = true;
        return [{ data: result, event: '' }];
      }

      return [];
    } catch {
      return [event];
    }
  }

  flush(): SSEEvent[] {
    return [];
  }
}
