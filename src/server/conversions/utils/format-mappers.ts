/**
 * Shared format mapping helpers for Gemini ↔ Completions conversions.
 * Eliminates duplication between response.ts and streaming.ts within the pair.
 */

/** Map Gemini finishReason to Completions finish_reason. */
export function mapGeminiFinishReason(reason: string | undefined): string {
  switch (reason) {
    case 'STOP': return 'stop';
    case 'MAX_TOKENS': return 'length';
    case 'SAFETY': return 'content_filter';
    case 'RECITATION': return 'content_filter';
    case 'FINISH_REASON_UNSPECIFIED': return 'stop';
    default: return 'stop';
  }
}

/** Map Completions finish_reason to Gemini finishReason. */
export function mapCompletionsFinishReason(reason: string | undefined): string {
  switch (reason) {
    case 'stop': return 'STOP';
    case 'length': return 'MAX_TOKENS';
    case 'content_filter': return 'SAFETY';
    case 'tool_calls': return 'STOP';
    default: return 'STOP';
  }
}

/** Map Gemini usageMetadata to Completions usage. */
export function mapGeminiUsage(metadata: any): { prompt_tokens: number; completion_tokens: number; total_tokens: number } {
  if (!metadata) return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const prompt = metadata.promptTokenCount ?? 0;
  const completion = metadata.candidatesTokenCount ?? 0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: metadata.totalTokenCount ?? (prompt + completion),
  };
}

/** Map Completions usage to Gemini usageMetadata. */
export function mapCompletionsUsage(usage: any): any {
  if (!usage) return { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };
  const prompt = usage.prompt_tokens ?? 0;
  const completion = usage.completion_tokens ?? 0;
  return {
    promptTokenCount: prompt,
    candidatesTokenCount: completion,
    totalTokenCount: usage.total_tokens ?? (prompt + completion),
  };
}
