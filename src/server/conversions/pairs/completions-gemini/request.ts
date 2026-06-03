/**
 * OpenAI Chat Completions → Gemini generateContent request conversion.
 *
 * Direct mapping without Claude intermediate — preserves all fields:
 * - function_call / tool_calls ↔ functionCall / functionResponse
 * - system message → systemInstruction
 * - generationConfig mapping
 * - tool_choice ↔ toolConfig
 * - images (inlineData) ↔ base64 image content
 */

import { completionsToGeminiTools } from '../../utils/tool-schema.js';

/**
 * Convert a Chat Completions request body to a Gemini generateContent request body.
 */
export function completionsToGemini(body: any): any {
  const contents: any[] = [];
  let systemInstruction: any = undefined;

  for (const msg of body.messages || []) {
    if (msg.role === 'system' || msg.role === 'developer') {
      // System messages → systemInstruction (merge multiple)
      const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      if (systemInstruction) {
        systemInstruction.parts[0].text += '\n\n' + text;
      } else {
        systemInstruction = { parts: [{ text }] };
      }
      continue;
    }

    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts = convertCompletionsMessageToGeminiParts(msg);
    contents.push({ role, parts });
  }

  // --- Generation config ---
  const generationConfig: any = {};
  if (body.max_tokens) generationConfig.maxOutputTokens = body.max_tokens;
  if (body.max_completion_tokens) generationConfig.maxOutputTokens = body.max_completion_tokens;
  if (body.temperature !== undefined) generationConfig.temperature = body.temperature;
  if (body.top_p !== undefined) generationConfig.topP = body.top_p;
  if (body.stop) {
    generationConfig.stopSequences = Array.isArray(body.stop) ? body.stop : [body.stop];
  }

  // --- Build result ---
  const result: any = {
    contents,
    generationConfig,
  };

  if (systemInstruction) result.systemInstruction = systemInstruction;
  if (body.model) result.model = body.model;
  if (body.stream !== undefined) result.stream = body.stream;

  // --- Tools ---
  if (body.tools && body.tools.length > 0) {
    const functionDeclarations = completionsToGeminiTools(body.tools);
    if (functionDeclarations.length > 0) {
      result.tools = [{ functionDeclarations }];
    }
  }

  // --- Tool choice → toolConfig ---
  if (body.tool_choice !== undefined) {
    const tc = body.tool_choice;
    if (tc === 'required' || tc === 'any') {
      result.toolConfig = { functionCallingConfig: { mode: 'ANY' } };
    } else if (tc === 'auto') {
      result.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
    } else if (tc === 'none') {
      result.toolConfig = { functionCallingConfig: { mode: 'NONE' } };
    } else if (typeof tc === 'object') {
      if (tc.type === 'function' && tc.function?.name) {
        result.toolConfig = {
          functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [tc.function.name] },
        };
      } else if (tc.type === 'required' || tc.type === 'any') {
        result.toolConfig = { functionCallingConfig: { mode: 'ANY' } };
      }
    }
  }

  // --- Reasoning effort → thinking config ---
  if (body.reasoning_effort) {
    result.generationConfig.thinkingConfig = {
      thinkingBudget: mapEffortToThinkingBudget(body.reasoning_effort),
    };
  }

  return result;
}

/**
 * Convert a single Completions message to Gemini parts.
 */
function convertCompletionsMessageToGeminiParts(msg: any): any[] {
  const parts: any[] = [];

  // reasoning_content → skip (no Gemini equivalent, but we don't lose it
  // because it stays in the request context as history)

  // Text content
  if (msg.content && typeof msg.content === 'string') {
    parts.push({ text: msg.content });
  } else if (msg.content && typeof msg.content === 'object') {
    // Array content (multimodal)
    for (const item of Array.isArray(msg.content) ? msg.content : [msg.content]) {
      if (item.type === 'text') {
        parts.push({ text: item.text });
      } else if (item.type === 'image_url') {
        // data URL → inlineData
        const url = item.image_url?.url || '';
        if (url.startsWith('data:')) {
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          }
        } else {
          parts.push({ text: url }); // fallback: pass URL as text
        }
      }
    }
  }

  // Tool calls → functionCall parts
  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      const args = typeof tc.function?.arguments === 'string'
        ? JSON.parse(tc.function.arguments)
        : tc.function?.arguments || {};
      parts.push({
        functionCall: {
          name: tc.function?.name || '',
          args,
        },
      });
    }
  }

  // Tool result → functionResponse part
  if (msg.role === 'tool') {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    parts.push({
      functionResponse: {
        name: msg.name || msg.tool_call_id || '',
        response: { content },
      },
    });
  }

  return parts.length > 0 ? parts : [{ text: '' }];
}

/**
 * Map reasoning_effort string to Gemini thinkingBudget number.
 */
function mapEffortToThinkingBudget(effort: string): number {
  switch (effort) {
    case 'low': return 2048;
    case 'medium': return 8192;
    case 'high': return 24576;
    default: return 8192;
  }
}
