/**
 * Usage/token count mapping across all API formats.
 */

/** Map OpenAI Chat usage to Claude usage */
export function completionsToClaudeUsage(usage: any): { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } {
  if (!usage) return { input_tokens: 0, output_tokens: 0 };
  return {
    input_tokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
    output_tokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? usage.prompt_tokens_details?.cached_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens,
  };
}

/** Map Claude usage to OpenAI Chat usage */
export function claudeToCompletionsUsage(usage: any): { prompt_tokens: number; completion_tokens: number; total_tokens: number } {
  if (!usage) return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const prompt = usage.input_tokens ?? 0;
  const completion = usage.output_tokens ?? 0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
  };
}

/** Map Gemini usageMetadata to Claude usage */
export function geminiToClaudeUsage(metadata: any): { input_tokens: number; output_tokens: number } {
  if (!metadata) return { input_tokens: 0, output_tokens: 0 };
  return {
    input_tokens: metadata.promptTokenCount ?? 0,
    output_tokens: (metadata.totalTokenCount ?? 0) - (metadata.promptTokenCount ?? 0),
  };
}

/** Map Claude usage to Gemini usageMetadata */
export function claudeToGeminiUsage(usage: any): any {
  if (!usage) return {};
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  return {
    promptTokenCount: input,
    candidatesTokenCount: output,
    totalTokenCount: input + output,
  };
}

/** Map Responses API usage to Claude usage */
export function responsesToClaudeUsage(usage: any): { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } {
  if (!usage) return { input_tokens: 0, output_tokens: 0 };
  return {
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? usage.input_tokens_details?.cached_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens,
  };
}

/** Map OpenAI Chat usage to Responses API usage */
export function completionsToResponsesUsage(usage: any): any {
  if (!usage) return {};
  return {
    input_tokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
    output_tokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
    total_tokens: usage.total_tokens ?? ((usage.input_tokens ?? usage.prompt_tokens ?? 0) + (usage.output_tokens ?? usage.completion_tokens ?? 0)),
  };
}
