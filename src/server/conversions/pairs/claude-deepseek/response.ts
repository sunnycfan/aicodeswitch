/**
 * DeepSeek Reasoning → Claude Messages response conversion.
 *
 * Extends Chat Completions response conversion with reasoning_content → thinking mapping.
 */

import { generateMessageId, generateToolUseId } from '../../utils/id.js';
import { completionsToClaudeStopReason } from '../../utils/stop-reasons.js';
import { completionsToClaudeUsage } from '../../utils/usage.js';

/**
 * Convert DeepSeek response to Claude Messages response.
 * Extends OpenAI response conversion with reasoning_content → thinking block.
 */
export function deepseekToClaudeResponse(response: any): any {
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

  // text content
  if (choice.message?.content) {
    content.push({
      type: 'text',
      text: choice.message.content,
    });
  }

  // tool calls → tool_use blocks
  if (choice.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let input = {};
      try {
        input = JSON.parse(tc.function?.arguments || '{}');
      } catch {}
      content.push({
        type: 'tool_use',
        id: tc.id || generateToolUseId(),
        name: tc.function?.name || '',
        input,
      });
    }
  }

  return {
    id: generateMessageId(),
    type: 'message',
    role: 'assistant',
    content,
    model: response.model || '',
    stop_reason: completionsToClaudeStopReason(choice.finish_reason),
    stop_sequence: null,
    usage: completionsToClaudeUsage(response.usage),
  };
}
