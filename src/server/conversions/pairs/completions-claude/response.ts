/**
 * Claude Messages → OpenAI Chat Completions response conversion.
 *
 * Converts a Claude Messages response into a Chat Completions response.
 */

import { claudeToCompletionsStopReason } from '../../utils/stop-reasons.js';
import { claudeToCompletionsUsage } from '../../utils/usage.js';
import { generateCompletionsId } from '../../utils/id.js';

/**
 * Convert a Claude Messages response into an OpenAI Chat Completions response.
 */
export function claudeResponseToCompletions(response: any): any {
  const content = response.content || [];
  let textContent = '';
  let reasoningContent: string | undefined;
  const toolCalls: any[] = [];

  for (const block of content) {
    if (block.type === 'thinking') {
      // Extract thinking text into reasoning_content field
      reasoningContent = (reasoningContent || '') + (block.thinking || '');
    } else if (block.type === 'text') {
      textContent += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments:
            typeof block.input === 'string'
              ? block.input
              : JSON.stringify(block.input),
        },
      });
    }
  }

  const message: any = {
    role: 'assistant',
    content: textContent || null,
  };

  if (reasoningContent) {
    message.reasoning_content = reasoningContent;
  }

  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  const finishReason = claudeToCompletionsStopReason(response.stop_reason);
  const usage = claudeToCompletionsUsage(response.usage);

  return {
    id: response.id || generateCompletionsId(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: response.model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason,
      },
    ],
    usage,
  };
}
