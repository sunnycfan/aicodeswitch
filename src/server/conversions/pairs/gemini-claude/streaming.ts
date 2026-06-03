/**
 * Claude SSE → Gemini SSE streaming converter.
 *
 * ClaudeToGeminiConverter: Stateful converter for Claude SSE → Gemini SSE.
 */

import type { SSEEvent, StreamConverter } from '../../types.js';
import { claudeToGeminiStopReason } from '../../utils/stop-reasons.js';
import { parseEventData } from '../../utils/streaming-helpers.js';

/**
 * Stateful converter that transforms Claude SSE events into Gemini streaming
 * chunks. Gemini streaming uses cumulative snapshots, so the converter
 * accumulates Claude content and outputs Gemini cumulative candidate objects.
 */
export class ClaudeToGeminiConverter implements StreamConverter {
  private textContent = '';
  private toolCalls: { name: string; args: any; [key: string]: any }[] = [];
  private currentToolJson = '';

  convertEvent(event: SSEEvent): SSEEvent[] {
    if (!event.data) return [];

    // Pass through [DONE]
    if (event.data === '[DONE]' || (typeof event.data === 'object' && event.data?.type === 'done')) {
      return [{ data: '[DONE]', event: event.event }];
    }

    try {
      const parsed = parseEventData(event.data);
      const type = parsed.type;
      const results: SSEEvent[] = [];

      switch (type) {
        case 'message_start':
          // Nothing to emit for Gemini on start
          break;

        case 'content_block_start': {
          const block = parsed.content_block;
          if (block?.type === 'text') {
            this.textContent = '';
          } else if (block?.type === 'tool_use') {
            this.currentToolJson = '';
          }
          break;
        }

        case 'content_block_delta': {
          const delta = parsed.delta;
          if (delta?.type === 'text_delta' && delta.text) {
            this.textContent += delta.text;
            // Emit cumulative snapshot
            results.push({
              data: this.buildCumulativeChunk(),
            });
          } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
            this.currentToolJson += delta.partial_json;
          }
          break;
        }

        case 'content_block_stop': {
          // If we were accumulating a tool call, finalize it
          if (this.currentToolJson) {
            try {
              const args = JSON.parse(this.currentToolJson);
              this.toolCalls.push(args);
            } catch {
              this.toolCalls.push({ name: '', args: {}, raw: this.currentToolJson });
            }
            this.currentToolJson = '';
            // Emit snapshot with the new tool call included
            results.push({
              data: this.buildCumulativeChunk(),
            });
          }
          break;
        }

        case 'message_delta': {
          const stopReason = claudeToGeminiStopReason(parsed.delta?.stop_reason);
          const usage = parsed.usage;
          const chunk: any = this.buildCumulativeChunk();
          // Set finishReason on the first candidate
          if (chunk.candidates?.[0]) {
            chunk.candidates[0].finishReason = stopReason;
          }
          if (usage?.output_tokens) {
            chunk.usageMetadata = chunk.usageMetadata || {};
            chunk.usageMetadata.candidatesTokenCount = usage.output_tokens;
          }
          results.push({ data: chunk });
          break;
        }

        case 'message_stop':
          // Nothing extra to emit
          break;
      }

      return results;
    } catch {
      return [event];
    }
  }

  // --- Helpers --------------------------------------------------------------

  private buildCumulativeChunk(): any {
    const parts: any[] = [];

    if (this.textContent) {
      parts.push({ text: this.textContent });
    }

    for (const tc of this.toolCalls) {
      parts.push({
        functionCall: {
          name: tc.name || '',
          args: tc.args || tc,
        },
      });
    }

    return {
      candidates: [
        {
          content: {
            parts: parts.length > 0 ? parts : [],
            role: 'model',
          },
        },
      ],
    };
  }
}
