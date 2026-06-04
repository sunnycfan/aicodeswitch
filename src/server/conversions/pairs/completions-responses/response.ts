/**
 * OpenAI Responses API → OpenAI Chat Completions response conversion.
 *
 * Converts a Responses API response into a Chat Completions response.
 */

import {
  responsesToCompletionsFinishReason,
} from '../../utils/stop-reasons.js';
import { generateCompletionsId } from '../../utils/id.js';

/**
 * Convert a Responses API response to a Chat Completions response.
 */
export function responsesToCompletionsResponse(response: any): any {
  const output = response.output || [];

  let content = '';
  let reasoningContent: string | undefined;
  const toolCalls: any[] = [];

  for (const item of output) {
    if (item.type === 'message') {
      // Join output_text texts
      const texts = (item.content || [])
        .filter((c: any) => c.type === 'output_text')
        .map((c: any) => c.text || '');
      content += texts.join('');
    } else if (item.type === 'reasoning') {
      // Join summary texts
      const summaries = (item.summary || [])
        .map((s: any) => s.text || '')
        .filter(Boolean);
      if (summaries.length > 0) {
        reasoningContent = (reasoningContent || '') + summaries.join('\n');
      }
    } else if (item.type === 'function_call') {
      toolCalls.push({
        id: item.call_id,
        type: 'function',
        function: {
          name: item.name || '',
          arguments: item.arguments || '{}',
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

  const finishReason = responsesToCompletionsFinishReason(response.status);
  const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  return {
    id: response.id?.startsWith('chatcmpl-') ? response.id : generateCompletionsId(),
    object: 'chat.completion',
    created: response.created_at || Math.floor(Date.now() / 1000),
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
