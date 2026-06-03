/**
 * Claude Messages → DeepSeek Reasoning response conversion.
 *
 * Extends claude-chat response conversion with thinking → reasoning_content mapping.
 */

import { claudeToCompletionsStopReason } from '../../utils/stop-reasons.js';
import { claudeToCompletionsUsage } from '../../utils/usage.js';

/**
 * Convert Claude Messages response to DeepSeek response.
 * Extends OpenAI response conversion with thinking → reasoning_content mapping.
 */
export function claudeToDeepSeekResponse(response: any): any {
  if (!response?.content) return response;

  let content = '';
  let reasoningContent: string | undefined;
  const toolCalls: any[] = [];

  for (const block of response.content) {
    if (block.type === 'thinking') {
      reasoningContent = block.thinking;
    } else if (block.type === 'text') {
      content += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: typeof block.input === 'string' ? block.input : JSON.stringify(block.input),
        },
      });
    }
  }

  const message: any = {
    role: 'assistant',
    content: content || null,
  };
  if (reasoningContent) {
    message.reasoning_content = reasoningContent;
  }
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: response.model || '',
    choices: [{
      index: 0,
      message,
      finish_reason: claudeToCompletionsStopReason(response.stop_reason),
    }],
    usage: claudeToCompletionsUsage(response.usage),
  };
}
