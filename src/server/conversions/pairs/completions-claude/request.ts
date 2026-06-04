/**
 * OpenAI Chat Completions → Claude Messages request conversion.
 *
 * Converts a Chat Completions request body into a Claude Messages request body.
 */

import { completionsToClaudeTools } from '../../utils/tool-schema.js';

/**
 * Convert an OpenAI Chat Completions request body to a Claude Messages request body.
 */
export function completionsToClaude(body: any): any {
  const messages: any[] = [];
  let systemPrompt: string | undefined;

  for (const msg of body.messages) {
    if (msg.role === 'system') {
      systemPrompt =
        typeof msg.content === 'string' ? msg.content : msg.content;
      continue;
    }

    const content = convertCompletionsMessageToClaude(msg);
    if (content) {
      const role =
        msg.role === 'tool'
          ? 'user'
          : msg.role === 'function'
            ? 'assistant'
            : msg.role;
      messages.push({ role, content });
    }
  }

  const result: any = {
    model: body.model,
    messages,
    max_tokens: body.max_tokens || 8192,
    stream: body.stream || false,
  };

  if (systemPrompt) result.system = systemPrompt;
  if (body.temperature !== undefined) result.temperature = body.temperature;
  if (body.top_p !== undefined) result.top_p = body.top_p;
  if (body.stop) {
    result.stop_sequences = Array.isArray(body.stop) ? body.stop : [body.stop];
  }

  // Tool mapping (OpenAI parameters → Claude input_schema)
  if (body.tools && body.tools.length > 0) {
    result.tools = completionsToClaudeTools(body.tools);
  }

  return result;
}

/**
 * Convert a single OpenAI message into Claude content (string or content block array).
 */
function convertCompletionsMessageToClaude(msg: any): any {
  // Assistant with tool_calls
  if (msg.role === 'assistant' && msg.tool_calls) {
    const content: any[] = [];

    // reasoning_content → thinking block (prepend)
    if (msg.reasoning_content) {
      content.push({
        type: 'thinking',
        thinking: msg.reasoning_content,
      });
    }

    if (msg.content) {
      content.push({ type: 'text', text: msg.content });
    }

    for (const tc of msg.tool_calls) {
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
    return content;
  }

  // Tool role → tool_result block
  if (msg.role === 'tool') {
    return {
      type: 'tool_result',
      tool_use_id: msg.tool_call_id,
      content: msg.content,
    };
  }

  // Function role → tool_result block
  if (msg.role === 'function') {
    return {
      type: 'tool_result',
      tool_use_id: msg.name,
      content: msg.content,
    };
  }

  // Plain assistant with reasoning_content (no tool_calls)
  if (msg.role === 'assistant' && msg.reasoning_content) {
    const content: any[] = [];
    content.push({
      type: 'thinking',
      thinking: msg.reasoning_content,
    });
    if (msg.content) {
      content.push({ type: 'text', text: msg.content });
    }
    return content;
  }

  return msg.content;
}
