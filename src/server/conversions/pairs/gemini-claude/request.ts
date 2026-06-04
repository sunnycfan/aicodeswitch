/**
 * Gemini generateContent → Claude Messages request conversion.
 */

import { geminiToClaudeTools } from '../../utils/tool-schema.js';
import { generateToolUseId } from '../../utils/id.js';

/**
 * Convert a Gemini generateContent request body to a Claude Messages request body.
 */
export function geminiToClaude(body: any): any {
  const messages: any[] = [];

  // --- System instruction → system ------------------------------------------
  let system: string | undefined;
  if (body.systemInstruction) {
    const parts = body.systemInstruction.parts || [];
    system = parts.map((p: any) => p.text || '').join('\n\n');
  }

  // --- Contents → messages --------------------------------------------------
  if (body.contents) {
    for (const entry of body.contents) {
      const role = entry.role === 'model' ? 'assistant' : 'user';
      const content = convertGeminiPartsToClaudeContent(entry.parts);
      messages.push({ role, content });
    }
  }

  // --- Build result ---------------------------------------------------------
  const result: any = {
    messages,
    stream: false,
  };

  if (system) result.system = system;

  // --- Generation config reverse mapping ------------------------------------
  const gc = body.generationConfig || {};
  if (gc.maxOutputTokens) result.max_tokens = gc.maxOutputTokens;
  if (gc.temperature !== undefined) result.temperature = gc.temperature;
  if (gc.topP !== undefined) result.top_p = gc.topP;
  if (gc.stopSequences) result.stop_sequences = gc.stopSequences;

  // --- Tools reverse mapping ------------------------------------------------
  const functionDeclarations = body.tools?.flatMap((t: any) => t.functionDeclarations || t) || [];
  if (functionDeclarations.length > 0) {
    result.tools = geminiToClaudeTools(functionDeclarations);
  }

  // --- ToolConfig reverse mapping -------------------------------------------
  if (body.toolConfig?.functionCallingConfig) {
    const fcc = body.toolConfig.functionCallingConfig;
    if (fcc.mode === 'ANY') {
      if (fcc.allowedFunctionNames && fcc.allowedFunctionNames.length === 1) {
        result.tool_choice = { type: 'tool', name: fcc.allowedFunctionNames[0] };
      } else {
        result.tool_choice = { type: 'any' };
      }
    } else if (fcc.mode === 'AUTO') {
      result.tool_choice = { type: 'auto' };
    } else if (fcc.mode === 'NONE') {
      result.tool_choice = { type: 'none' };
    }
  }

  return result;
}

/**
 * Convert Gemini parts array into Claude content (string or content block array).
 */
function convertGeminiPartsToClaudeContent(parts: any[]): any {
  if (!parts || parts.length === 0) return '';

  const blocks: any[] = [];

  for (const part of parts) {
    if (part.text !== undefined && part.text !== null) {
      blocks.push({ type: 'text', text: part.text });
    } else if (part.functionCall) {
      blocks.push({
        type: 'tool_use',
        id: generateToolUseId(),
        name: part.functionCall.name,
        input: part.functionCall.args || {},
      });
    } else if (part.functionResponse) {
      const content =
        part.functionResponse.response?.content ||
        JSON.stringify(part.functionResponse.response);
      blocks.push({
        type: 'tool_result',
        tool_use_id: part.functionResponse.name,
        content,
      });
    } else if (part.inlineData) {
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: part.inlineData.mimeType,
          data: part.inlineData.data,
        },
      });
    }
  }

  if (blocks.length === 0) return '';
  // If there is a single text block, return as plain string
  if (blocks.length === 1 && blocks[0].type === 'text') {
    return blocks[0].text;
  }
  return blocks;
}
