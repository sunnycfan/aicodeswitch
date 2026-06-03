/**
 * Gemini generateContent → OpenAI Chat Completions response conversion.
 *
 * Converts a Gemini response into a Chat Completions response.
 */

import { generateCompletionsId } from '../../utils/id.js';
import { mapGeminiFinishReason, mapGeminiUsage } from '../../utils/format-mappers.js';

/**
 * Convert a Gemini generateContent response to a Chat Completions response.
 */
export function geminiToCompletionsResponse(response: any): any {
  const candidate = response.candidates?.[0];
  if (!candidate) {
    return {
      id: generateCompletionsId(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.modelVersion || '',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: '' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

  const parts = candidate.content?.parts || [];
  const message: any = { role: 'assistant', content: null };
  const texts: string[] = [];
  const toolCalls: any[] = [];

  for (const part of parts) {
    if (part.text !== undefined && part.text !== null) {
      texts.push(part.text);
    } else if (part.functionCall) {
      toolCalls.push({
        id: `call_${Math.random().toString(36).slice(2, 14)}`,
        type: 'function',
        function: {
          name: part.functionCall.name || '',
          arguments: typeof part.functionCall.args === 'string'
            ? part.functionCall.args
            : JSON.stringify(part.functionCall.args || {}),
        },
      });
    }
  }

  message.content = texts.join('') || null;
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  const finishReason = mapGeminiFinishReason(candidate.finishReason);
  const usage = mapGeminiUsage(response.usageMetadata);

  return {
    id: generateCompletionsId(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: response.modelVersion || '',
    choices: [{
      index: 0,
      message,
      finish_reason: finishReason,
    }],
    usage,
  };
}
