/**
 * Claude Messages → Gemini generateContent response conversion.
 */

import { claudeToGeminiStopReason } from '../../utils/stop-reasons.js';
import { claudeToGeminiUsage } from '../../utils/usage.js';

/**
 * Convert a Claude Messages response into a Gemini generateContent response.
 */
export function claudeToGeminiResponse(response: any): any {
  const parts: any[] = [];

  for (const block of response.content || []) {
    if (block.type === 'text') {
      parts.push({ text: block.text });
    } else if (block.type === 'tool_use') {
      parts.push({
        functionCall: {
          name: block.name,
          args: block.input,
        },
      });
    } else if (block.type === 'thinking') {
      // Skip thinking blocks — Gemini has no equivalent
      continue;
    }
  }

  const finishReason = claudeToGeminiStopReason(response.stop_reason);
  const usageMetadata = claudeToGeminiUsage(response.usage);

  return {
    candidates: [
      {
        content: {
          parts,
          role: 'model',
        },
        finishReason,
      },
    ],
    usageMetadata,
  };
}
