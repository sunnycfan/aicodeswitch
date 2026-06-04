/**
 * OpenAI Chat Completions → Claude Messages response conversion.
 *
 * Enhanced with reasoning_content / thinking block support.
 */

import { completionsToClaudeStopReason } from '../../utils/stop-reasons.js';
import { completionsToClaudeUsage } from '../../utils/usage.js';

/**
 * Convert an OpenAI Chat Completions response into a Claude Messages response.
 */
export function completionsResponseToClaude(response: any): any {
  const choice = response.choices?.[0];
  if (!choice) return response;

  const content: any[] = [];

  // reasoning_content → thinking block (prepend before other content)
  if (choice.message?.reasoning_content) {
    content.push({
      type: 'thinking',
      thinking: choice.message.reasoning_content,
    });
  }

  // Text content
  if (choice.message?.content) {
    content.push({ type: 'text', text: choice.message.content });
  }

  // Tool calls
  if (choice.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input:
          typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments,
      });
    }
  }

  const stopReason = completionsToClaudeStopReason(choice.finish_reason);
  const usage = completionsToClaudeUsage(response.usage);

  return {
    id: response.id,
    type: 'message',
    role: 'assistant',
    content,
    model: response.model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage,
  };
}
