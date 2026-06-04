/**
 * OpenAI Responses API → Claude Messages response conversion.
 */

import { generateMessageId, generateCallId } from '../../utils/id.js';
import { responsesToClaudeStopReason } from '../../utils/stop-reasons.js';
import { responsesToClaudeUsage } from '../../utils/usage.js';
import { reasoningToThinking } from '../../thinking/mapper.js';

/**
 * Convert an OpenAI Responses API response to a Claude Messages response.
 */
export function responsesToClaudeResponse(response: any): any {
  const output = response.output || [];
  const content: any[] = [];

  for (const item of output) {
    if (item.type === 'message') {
      // Message with text / refusal content
      if (Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part.type === 'output_text') {
            content.push({ type: 'text', text: part.text || '' });
          } else if (part.type === 'refusal') {
            content.push({ type: 'text', text: part.refusal || '' });
          }
        }
      }
    } else if (item.type === 'function_call') {
      let parsedInput: any;
      try {
        parsedInput = typeof item.arguments === 'string' ? JSON.parse(item.arguments) : item.arguments;
      } catch {
        parsedInput = {};
      }
      content.push({
        type: 'tool_use',
        id: item.call_id || generateCallId(),
        name: item.name,
        input: parsedInput,
      });
    } else if (item.type === 'reasoning') {
      // Reasoning with summary -> thinking block
      if (Array.isArray(item.summary) && item.summary.length > 0) {
        const thinkingBlock = reasoningToThinking(item.summary);
        if (thinkingBlock.thinking) {
          content.push(thinkingBlock);
        }
      }
    }
  }

  const hasToolUse = content.some((b: any) => b.type === 'tool_use');
  const stopReason = responsesToClaudeStopReason(
    response.status,
    response.incomplete_details?.reason,
    hasToolUse,
  );

  const usage = responsesToClaudeUsage(response.usage);

  return {
    id: response.id || generateMessageId(),
    type: 'message',
    role: 'assistant',
    content,
    model: response.model || '',
    stop_reason: stopReason,
    stop_sequence: null,
    usage,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map Claude usage to Responses API usage.
 */
export function claudeToResponsesUsage(usage: any): any {
  if (!usage) return { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: input + output,
  };
}
