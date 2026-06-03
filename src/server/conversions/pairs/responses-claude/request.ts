/**
 * OpenAI Responses API → Claude Messages request conversion.
 *
 * Converts a Responses API request body into a Claude Messages request body.
 */

import { reasoningEffortToClaudeThinking } from '../../thinking/effort.js';
import { responsesToClaudeTools } from '../../utils/tool-schema.js';

/**
 * Convert an OpenAI Responses API request body to a Claude Messages request body.
 */
export function responsesToClaude(body: any): any {
  const messages: any[] = [];
  let systemPrompt: string | undefined;

  // --- Instructions -> system ---
  if (body.instructions) {
    systemPrompt = typeof body.instructions === 'string'
      ? body.instructions
      : undefined;
  }

  // --- Input -> messages ---
  if (body.input) {
    for (const item of body.input) {
      if (item.type === 'message') {
        if (item.role === 'user') {
          const content = extractMessageContent(item, 'input_text');
          if (content.length > 0) {
            messages.push({ role: 'user', content });
          }
        } else if (item.role === 'assistant' || item.role === 'developer') {
          const content = extractMessageContent(item, 'output_text');
          if (content.length > 0) {
            messages.push({ role: item.role === 'developer' ? 'user' : 'assistant', content });
          }
        }
      } else if (item.type === 'function_call') {
        let parsedInput: any;
        try {
          parsedInput = typeof item.arguments === 'string' ? JSON.parse(item.arguments) : item.arguments;
        } catch {
          parsedInput = item.arguments;
        }
        messages.push({
          role: 'assistant',
          content: [{
            type: 'tool_use',
            id: item.call_id,
            name: item.name,
            input: parsedInput,
          }],
        });
      } else if (item.type === 'function_call_output') {
        messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: item.call_id,
            content: item.output,
          }],
        });
      } else if (item.type === 'reasoning') {
        // Skip reasoning items in messages (effort is extracted for thinking config below)
        continue;
      }
    }
  }

  // --- Build result ---
  const result: any = {
    model: body.model,
    messages,
    max_tokens: body.max_output_tokens || 8192,
    stream: body.stream ?? false,
  };

  if (systemPrompt) result.system = systemPrompt;
  if (body.temperature !== undefined) result.temperature = body.temperature;
  if (body.top_p !== undefined) result.top_p = body.top_p;

  // --- Reasoning -> thinking ---
  if (body.reasoning?.effort) {
    result.thinking = reasoningEffortToClaudeThinking(body.reasoning.effort);
  }

  // --- Tools ---
  if (body.tools && body.tools.length > 0) {
    result.tools = responsesToClaudeTools(body.tools);
  }

  // --- Tool choice reverse mapping ---
  if (body.tool_choice !== undefined) {
    result.tool_choice = mapResponsesToolChoice(body.tool_choice);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract content blocks from a Responses API message item into Claude content blocks.
 */
function extractMessageContent(item: any, textType: string): any[] {
  const content: any[] = [];
  if (item.content) {
    if (typeof item.content === 'string') {
      content.push({ type: 'text', text: item.content });
    } else if (Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part.type === textType || part.type === 'text') {
          content.push({ type: 'text', text: part.text || '' });
        } else if (part.type === 'input_image' && part.image_url) {
          // Parse data URL back into image block
          const dataUrlMatch = part.image_url.match(/^data:([^;]+);base64,(.+)$/);
          if (dataUrlMatch) {
            content.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: dataUrlMatch[1],
                data: dataUrlMatch[2],
              },
            });
          }
        }
      }
    }
  }
  if (item.text) {
    content.push({ type: 'text', text: item.text });
  }
  return content;
}

/**
 * Map Responses API tool_choice to Claude tool_choice.
 */
function mapResponsesToolChoice(toolChoice: any): any {
  if (toolChoice === 'required') return { type: 'any' };
  if (toolChoice === 'auto') return { type: 'auto' };
  if (toolChoice === 'none') return { type: 'none' };
  if (typeof toolChoice === 'object' && toolChoice.type === 'function') {
    return { type: 'tool', name: toolChoice.name };
  }
  return { type: 'auto' };
}
