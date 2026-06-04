/**
 * Tool schema conversion utilities across API formats.
 */

/** Claude tools → OpenAI Chat tools */
export function claudeToCompletionsTools(tools: any[]): any[] {
  if (!tools?.length) return [];
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.input_schema || {},
    },
  }));
}

/** OpenAI Chat tools → Claude tools */
export function completionsToClaudeTools(tools: any[]): any[] {
  if (!tools?.length) return [];
  return tools
    .filter(t => t.type === 'function' && t.function)
    .map(t => ({
      name: t.function.name,
      description: t.function.description || '',
      input_schema: t.function.parameters || {},
    }));
}

/** Claude tools → Responses API tools */
export function claudeToResponsesTools(tools: any[]): any[] {
  if (!tools?.length) return [];
  return tools.map(tool => ({
    type: 'function',
    name: tool.name,
    description: tool.description || '',
    parameters: cleanSchema(tool.input_schema || {}),
  }));
}

/** Responses API tools → Claude tools */
export function responsesToClaudeTools(tools: any[]): any[] {
  if (!tools?.length) return [];
  return tools
    .filter(t => t.type === 'function')
    .map(t => ({
      name: t.name,
      description: t.description || '',
      input_schema: cleanSchema(t.parameters || {}),
    }));
}

/** Claude tools → Gemini functionDeclarations */
export function claudeToGeminiTools(tools: any[]): any[] {
  if (!tools?.length) return [];
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description || '',
    parameters: convertSchemaToGemini(tool.input_schema || {}),
  }));
}

/** Gemini functionDeclarations → Claude tools */
export function geminiToClaudeTools(tools: any[]): any[] {
  if (!tools?.length) return [];
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description || '',
    input_schema: convertSchemaFromGemini(tool.parameters || {}),
  }));
}

/** OpenAI Chat tools → Gemini functionDeclarations */
export function completionsToGeminiTools(tools: any[]): any[] {
  if (!tools?.length) return [];
  return tools
    .filter(t => t.type === 'function' && t.function)
    .map(t => ({
      name: t.function.name,
      description: t.function.description || '',
      parameters: convertSchemaToGemini(t.function.parameters || {}),
    }));
}

/** Clean/normalize a JSON Schema (strip cache_control, etc.) */
function cleanSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const result: any = Array.isArray(schema) ? [] : {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'cache_control' || key === 'x-cache-control') continue;
    if (key === 'additionalProperties' && value === false) continue;
    result[key] = typeof value === 'object' && value !== null ? cleanSchema(value) : value;
  }
  return result;
}

/** Recursively convert JSON Schema to Gemini format (type strings uppercased) */
export function convertSchemaToGemini(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(convertSchemaToGemini);

  const result: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && typeof value === 'string') {
      result[key] = value.toUpperCase();
    } else if (key === 'properties') {
      result[key] = {};
      for (const [propName, propVal] of Object.entries(value as Record<string, any>)) {
        result[key][propName] = convertSchemaToGemini(propVal);
      }
    } else if (key === 'items') {
      result[key] = convertSchemaToGemini(value);
    } else if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
      result[key] = (value as any[]).map(convertSchemaToGemini);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = convertSchemaToGemini(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Recursively convert Gemini schema back to JSON Schema (type strings lowercased) */
export function convertSchemaFromGemini(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(convertSchemaFromGemini);

  const result: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && typeof value === 'string') {
      result[key] = value.toLowerCase();
    } else if (key === 'properties') {
      result[key] = {};
      for (const [propName, propVal] of Object.entries(value as Record<string, any>)) {
        result[key][propName] = convertSchemaFromGemini(propVal);
      }
    } else if (key === 'items') {
      result[key] = convertSchemaFromGemini(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = convertSchemaFromGemini(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
