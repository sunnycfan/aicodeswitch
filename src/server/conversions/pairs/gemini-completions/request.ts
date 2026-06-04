/**
 * Gemini generateContent → OpenAI Chat Completions request conversion.
 */

/**
 * Convert a Gemini generateContent request body to a Chat Completions request body.
 */
export function geminiToCompletions(body: any): any {
  const messages: any[] = [];

  // --- System instruction → system message ---
  if (body.systemInstruction) {
    const text = (body.systemInstruction.parts || [])
      .map((p: any) => p.text || '')
      .join('\n\n');
    if (text) {
      messages.push({ role: 'system', content: text });
    }
  }

  // --- Contents → messages ---
  if (body.contents) {
    for (const entry of body.contents) {
      const role = entry.role === 'model' ? 'assistant' : 'user';
      const converted = convertGeminiPartsToCompletionsMessage(entry.parts, role);
      if (converted) messages.push(converted);
    }
  }

  // --- Build result ---
  const result: any = {
    messages,
    stream: false,
  };

  // --- Generation config reverse mapping ---
  const gc = body.generationConfig || {};
  if (gc.maxOutputTokens) result.max_tokens = gc.maxOutputTokens;
  if (gc.temperature !== undefined) result.temperature = gc.temperature;
  if (gc.topP !== undefined) result.top_p = gc.topP;
  if (gc.stopSequences) result.stop = gc.stopSequences;

  // --- Tools reverse mapping ---
  const funcDecls = body.tools?.flatMap((t: any) => t.functionDeclarations || t) || [];
  if (funcDecls.length > 0) {
    result.tools = funcDecls.map((fd: any) => ({
      type: 'function',
      function: {
        name: fd.name,
        description: fd.description || '',
        parameters: fd.parameters || {},
      },
    }));
  }

  // --- ToolConfig reverse mapping ---
  if (body.toolConfig?.functionCallingConfig) {
    const fcc = body.toolConfig.functionCallingConfig;
    if (fcc.mode === 'ANY') {
      if (fcc.allowedFunctionNames?.length === 1) {
        result.tool_choice = { type: 'function', function: { name: fcc.allowedFunctionNames[0] } };
      } else {
        result.tool_choice = 'required';
      }
    } else if (fcc.mode === 'AUTO') {
      result.tool_choice = 'auto';
    } else if (fcc.mode === 'NONE') {
      result.tool_choice = 'none';
    }
  }

  // --- Thinking config → reasoning_effort ---
  if (gc.thinkingConfig?.thinkingBudget) {
    result.reasoning_effort = mapThinkingBudgetToEffort(gc.thinkingConfig.thinkingBudget);
  }

  return result;
}

/**
 * Convert Gemini parts array to a Completions message object.
 */
function convertGeminiPartsToCompletionsMessage(parts: any[], role: string): any {
  if (!parts || parts.length === 0) return { role, content: '' };

  const texts: string[] = [];
  const toolCalls: any[] = [];
  let hasFunctionResponse = false;
  let functionResponseContent: string | undefined;
  let functionResponseName: string | undefined;

  for (const part of parts) {
    if (part.text !== undefined && part.text !== null) {
      texts.push(part.text);
    } else if (part.functionCall) {
      toolCalls.push({
        id: `call_${Math.random().toString(36).slice(2, 14)}`,
        type: 'function',
        function: {
          name: part.functionCall.name || '',
          arguments: typeof part.functionCall.args === 'string'
            ? part.functionCall.args
            : JSON.stringify(part.functionCall.args || {}),
        },
      });
    } else if (part.functionResponse) {
      hasFunctionResponse = true;
      functionResponseName = part.functionResponse.name;
      functionResponseContent = part.functionResponse.response?.content
        || JSON.stringify(part.functionResponse.response);
    } else if (part.inlineData) {
      texts.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
    }
  }

  // Tool result message
  if (hasFunctionResponse) {
    return {
      role: 'tool',
      tool_call_id: functionResponseName || '',
      content: functionResponseContent || '',
    };
  }

  // Assistant message with tool calls
  if (role === 'assistant' && toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: texts.join('') || null,
      tool_calls: toolCalls,
    };
  }

  // Plain message
  return {
    role,
    content: texts.join('') || '',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapThinkingBudgetToEffort(budget: number): string {
  if (budget <= 4096) return 'low';
  if (budget <= 16384) return 'medium';
  return 'high';
}
