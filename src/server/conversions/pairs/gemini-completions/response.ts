/**
 * Completions → Gemini response conversion for gemini-completions pair.
 *
 * Client=gemini, upstream=completions.
 * Converts upstream Chat Completions response → client Gemini generateContent response.
 */

import { mapCompletionsFinishReason, mapCompletionsUsage } from '../../utils/format-mappers.js';

/**
 * Convert a Chat Completions response to a Gemini generateContent response.
 */
export function completionsToGeminiResponse(response: any): any {
  const choice = response.choices?.[0];
  if (!choice) return response;

  const parts: any[] = [];

  // Text content
  if (choice.message?.content) {
    parts.push({ text: choice.message.content });
  }

  // Tool calls → functionCall parts
  if (choice.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      const args = typeof tc.function?.arguments === 'string'
        ? JSON.parse(tc.function.arguments)
        : tc.function?.arguments || {};
      parts.push({
        functionCall: {
          name: tc.function?.name || '',
          args,
        },
      });
    }
  }

  if (parts.length === 0) {
    parts.push({ text: '' });
  }

  const finishReason = mapCompletionsFinishReason(choice.finish_reason);
  const usage = mapCompletionsUsage(response.usage);

  return {
    candidates: [{
      content: {
        role: 'model',
        parts,
      },
      finishReason,
    }],
    usageMetadata: usage,
    modelVersion: response.model || '',
  };
}
