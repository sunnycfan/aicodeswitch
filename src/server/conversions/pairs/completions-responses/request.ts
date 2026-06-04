/**
 * OpenAI Chat Completions → OpenAI Responses API request conversion.
 *
 * Handles the mapping from Chat Completions' role-based messages array
 * to the Responses API's flat input items (message, function_call,
 * function_call_output, reasoning).
 */

import { generateCallId } from '../../utils/id.js';

/**
 * Convert a Chat Completions request body to an OpenAI Responses API request body.
 */
export function completionsToResponses(body: any): any {
  const input: any[] = [];
  let instructions: string | undefined;

  // --- Extract system messages -> instructions ---
  for (const msg of body.messages) {
    if (msg.role === 'system' || msg.role === 'developer') {
      const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      instructions = instructions ? instructions + '\n' + text : text;
    }
  }

  // --- Convert messages -> input array ---
  for (const msg of body.messages) {
    if (msg.role === 'system' || msg.role === 'developer') {
      continue; // already extracted as instructions
    }

    if (msg.role === 'user') {
      input.push({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }],
      });
    } else if (msg.role === 'assistant') {
      // reasoning_content -> reasoning item
      if (msg.reasoning_content) {
        input.push({
          type: 'reasoning',
          id: generateCallId().replace('call_', 'rs_'),
          summary: [{ type: 'summary_text', text: msg.reasoning_content }],
        });
      }

      // tool_calls -> function_call items
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          input.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.function?.name || '',
            arguments: tc.function?.arguments || '{}',
          });
        }
        // If there is also text content, emit a message item first
        if (msg.content) {
          // Insert message before the function_calls we just added
          const msgItem = {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: msg.content }],
          };
          // Find where tool_calls start and insert the message there
          const firstToolIdx = input.length - msg.tool_calls.length;
          input.splice(firstToolIdx, 0, msgItem);
        }
      } else if (msg.content) {
        // Plain assistant message
        input.push({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: msg.content }],
        });
      }
    } else if (msg.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: msg.tool_call_id,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      });
    }
  }

  // --- Build result ---
  const result: any = {
    model: body.model,
    input,
    stream: body.stream ?? false,
  };

  if (instructions) result.instructions = instructions;
  if (body.max_tokens !== undefined) result.max_output_tokens = body.max_tokens;
  if (body.max_completion_tokens !== undefined) result.max_output_tokens = body.max_completion_tokens;
  if (body.temperature !== undefined) result.temperature = body.temperature;
  if (body.top_p !== undefined) result.top_p = body.top_p;

  // --- Reasoning effort ---
  if (body.reasoning_effort) {
    result.reasoning = { effort: body.reasoning_effort };
  }

  // --- Tools ---
  if (body.tools && body.tools.length > 0) {
    result.tools = body.tools
      .filter((t: any) => t.type === 'function' && t.function)
      .map((t: any) => ({
        type: 'function',
        name: t.function.name,
        description: t.function.description || '',
        parameters: t.function.parameters || {},
      }));
  }

  // --- Tool choice reverse mapping ---
  if (body.tool_choice !== undefined) {
    result.tool_choice = completionsToResponsesToolChoice(body.tool_choice);
  }

  return result;
}

/**
 * Map Chat Completions tool_choice to Responses API tool_choice.
 */
function completionsToResponsesToolChoice(toolChoice: any): any {
  if (typeof toolChoice === 'string') {
    switch (toolChoice) {
      case 'any':
      case 'required': return 'required';
      case 'auto': return 'auto';
      case 'none': return 'none';
      default: return 'auto';
    }
  }
  if (typeof toolChoice === 'object') {
    if (toolChoice.type === 'function' && toolChoice.function) {
      return { type: 'function', name: toolChoice.function.name };
    }
    if (toolChoice.type === 'any') return 'required';
    if (toolChoice.type === 'auto') return 'auto';
    if (toolChoice.type === 'none') return 'none';
  }
  return 'auto';
}
