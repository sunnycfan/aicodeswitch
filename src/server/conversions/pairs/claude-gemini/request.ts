/**
 * Claude Messages → Gemini generateContent request conversion.
 */

import { claudeToGeminiTools } from '../../utils/tool-schema.js';

/**
 * Convert a Claude Messages request body to a Gemini generateContent request body.
 */
export function claudeToGemini(body: any): any {
  const contents: any[] = [];

  // --- System instruction ---------------------------------------------------
  const systemInstruction = body.system
    ? {
        parts: [
          {
            text:
              typeof body.system === 'string'
                ? body.system
                : Array.isArray(body.system)
                  ? body.system
                      .filter((s: any) => s.type === 'text' || typeof s.text === 'string')
                      .map((s: any) => s.text || '')
                      .join('\n\n')
                  : '',
          },
        ],
      }
    : undefined;

  // --- Messages → contents --------------------------------------------------
  if (body.messages) {
    for (const msg of body.messages) {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts = convertClaudeContentToGeminiParts(msg.content);
      contents.push({ role, parts });
    }
  }

  // --- Generation config ----------------------------------------------------
  const generationConfig: any = {};
  if (body.max_tokens) generationConfig.maxOutputTokens = body.max_tokens;
  if (body.temperature !== undefined) generationConfig.temperature = body.temperature;
  if (body.top_p !== undefined) generationConfig.topP = body.top_p;
  if (body.stop_sequences) generationConfig.stopSequences = body.stop_sequences;

  // --- Build result ---------------------------------------------------------
  const result: any = {
    contents,
    generationConfig,
  };

  if (systemInstruction) result.systemInstruction = systemInstruction;

  // --- Tools ----------------------------------------------------------------
  if (body.tools && body.tools.length > 0) {
    const functionDeclarations = claudeToGeminiTools(body.tools);
    if (functionDeclarations.length > 0) {
      result.tools = [{ functionDeclarations }];
    }
  }

  // --- Tool choice → toolConfig ---------------------------------------------
  if (body.tool_choice) {
    const tc = body.tool_choice;
    if (tc.type === 'any') {
      result.toolConfig = { functionCallingConfig: { mode: 'ANY' } };
    } else if (tc.type === 'auto') {
      result.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
    } else if (tc.type === 'none') {
      result.toolConfig = { functionCallingConfig: { mode: 'NONE' } };
    } else if (tc.type === 'tool' && tc.name) {
      result.toolConfig = {
        functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [tc.name] },
      };
    }
  }

  return result;
}

/**
 * Convert Claude content blocks (or string) into Gemini parts array.
 */
function convertClaudeContentToGeminiParts(content: any): any[] {
  if (typeof content === 'string') {
    return [{ text: content }];
  }

  if (Array.isArray(content)) {
    const parts: any[] = [];
    for (const block of content) {
      if (block.type === 'text') {
        parts.push({ text: block.text });
      } else if (block.type === 'image') {
        parts.push({
          inlineData: {
            mimeType: block.source.media_type,
            data: block.source.data,
          },
        });
      } else if (block.type === 'tool_use') {
        parts.push({
          functionCall: {
            name: block.name,
            args: block.input,
          },
        });
      } else if (block.type === 'tool_result') {
        const resultContent =
          typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content);
        parts.push({
          functionResponse: {
            name: block.tool_use_id,
            response: { content: resultContent },
          },
        });
      } else if (block.type === 'thinking') {
        // Skip thinking blocks
        continue;
      }
    }
    return parts.length > 0 ? parts : [{ text: '' }];
  }

  return [{ text: String(content) }];
}
