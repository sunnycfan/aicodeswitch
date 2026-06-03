/**
 * OpenAI Chat Completions → DeepSeek request conversion.
 *
 * Both formats share the same Chat Completions base structure.
 * DeepSeek adds: reasoning_content in messages, enable_thinking/reasoning_effort params.
 * Direct conversion avoids detail loss from Claude intermediate format.
 */

import { fixThinkingHistory } from '../../thinking/mapper.js';

/**
 * Convert a Chat Completions request to a DeepSeek request.
 *
 * Direct mapping: both share the same base format.
 * Adds DeepSeek-specific thinking configuration when reasoning_content is present.
 */
export function completionsToDeepseek(body: any): any {
  const result = { ...body };

  // Fix history: ensure assistant messages with tool_calls have reasoning_content
  if (result.messages) {
    result.messages = fixThinkingHistory(result.messages, 'completions');
  }

  // Map o-series reasoning_effort to DeepSeek native params if present
  if (result.reasoning_effort) {
    // DeepSeek supports reasoning_effort natively on some models
    // Keep as-is since DeepSeek understands this parameter
  }

  // DeepSeek doesn't use stream_options — remove it
  delete result.stream_options;

  return result;
}
