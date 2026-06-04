/**
 * Gemini SSE → Completions SSE streaming converter.
 */

import type { SSEEvent, StreamConverter } from '../../types.js';
import { generateCompletionsId } from '../../utils/id.js';
import { mapGeminiFinishReason } from '../../utils/format-mappers.js';
import { parseEventData } from '../../utils/streaming-helpers.js';

/**
 * Stateful converter that transforms Gemini streaming chunks into
 * Chat Completions SSE events.
 */
export class GeminiToCompletionsConverter implements StreamConverter {
  private started = false;
  private chatId = generateCompletionsId();
  private model = '';
  private textContent = '';
  private toolCallIndex = 0;

  convertEvent(event: SSEEvent): SSEEvent[] {
    if (!event.data) return [];

    try {
      const parsed = parseEventData(event.data);
      const chunks: SSEEvent[] = [];

      // Gemini streams candidates as cumulative snapshots
      const candidate = parsed.candidates?.[0];
      if (!candidate) return [];

      const parts = candidate.content?.parts || [];

      if (!this.started) {
        this.model = parsed.modelVersion || '';
        // Emit initial chunk with role
        chunks.push(this.makeChunk({ role: 'assistant', content: '' }, null));
        this.started = true;
      }

      // Process parts (diff against what we've already emitted)
      for (const part of parts) {
        if (part.text !== undefined && part.text !== null) {
          const newText = part.text.substring(this.textContent.length);
          if (newText) {
            chunks.push(this.makeChunk({ content: newText }, null));
          }
          this.textContent = part.text;
        } else if (part.functionCall) {
          // Emit tool call start
          const tcId = `call_${Math.random().toString(36).slice(2, 14)}`;
          chunks.push(this.makeChunk({
            tool_calls: [{
              index: this.toolCallIndex,
              id: tcId,
              type: 'function',
              function: {
                name: part.functionCall.name || '',
                arguments: typeof part.functionCall.args === 'string'
                  ? part.functionCall.args
                  : JSON.stringify(part.functionCall.args || {}),
              },
            }],
          }, null));
          this.toolCallIndex++;
        }
      }

      // Finish reason
      if (candidate.finishReason) {
        const finishReason = mapGeminiFinishReason(candidate.finishReason);
        const usage = parsed.usageMetadata
          ? {
              prompt_tokens: parsed.usageMetadata.promptTokenCount ?? 0,
              completion_tokens: parsed.usageMetadata.candidatesTokenCount ?? 0,
              total_tokens: parsed.usageMetadata.totalTokenCount ?? 0,
            }
          : undefined;

        chunks.push(this.makeChunk({}, finishReason, usage));
      }

      return chunks;
    } catch {
      return [event];
    }
  }

  flush(): SSEEvent[] {
    // Gemini streaming is cumulative, no state to flush
    return [];
  }

  private makeChunk(delta: any, finishReason: string | null, usage?: any): SSEEvent {
    const chunk: any = {
      id: this.chatId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [{
        index: 0,
        delta,
        finish_reason: finishReason,
      }],
    };
    if (usage) chunk.usage = usage;
    return { data: chunk, event: '' };
  }
}
