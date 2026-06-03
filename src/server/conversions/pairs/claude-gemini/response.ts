/**
 * Gemini generateContent → Claude Messages response conversion.
 */

import { geminiToClaudeStopReason } from '../../utils/stop-reasons.js';
import { geminiToClaudeUsage } from '../../utils/usage.js';
import { generateMessageId, generateToolUseId } from '../../utils/id.js';

/**
 * Convert a Gemini generateContent response into a Claude Messages response.
 */
export function geminiToClaudeResponse(response: any): any {
  const candidate = response.candidates?.[0];

  // Handle prompt feedback / blocked response
  if (!candidate) {
    const blockReason = response.promptFeedback?.blockReason;
    if (blockReason) {
      return {
        id: generateMessageId(),
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: `Response blocked: ${blockReason}`,
          },
        ],
        model: '',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    }
    return response;
  }

  const content: any[] = [];
  const parts = candidate.content?.parts || [];

  for (const part of parts) {
    if (part.text) {
      content.push({ type: 'text', text: part.text });
    }
    if (part.functionCall) {
      content.push({
        type: 'tool_use',
        id: generateToolUseId(),
        name: part.functionCall.name,
        input: part.functionCall.args || {},
      });
    }
  }

  const stopReason = geminiToClaudeStopReason(candidate.finishReason);
  const usage = geminiToClaudeUsage(response.usageMetadata);

  return {
    id: generateMessageId(),
    type: 'message',
    role: 'assistant',
    content,
    model: response.modelVersion || '',
    stop_reason: stopReason,
    stop_sequence: null,
    usage,
  };
}
