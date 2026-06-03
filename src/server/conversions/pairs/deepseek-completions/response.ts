/**
 * DeepSeek → OpenAI Chat Completions response conversion.
 *
 * Both formats share the same Chat Completions response structure.
 * DeepSeek returns reasoning_content in choice.message.
 * Direct conversion preserves all fields without intermediate loss.
 */

/**
 * Convert a DeepSeek response to a Chat Completions response.
 *
 * Direct passthrough: both formats are identical Chat Completions.
 * reasoning_content is preserved as-is — it's a valid field in both formats.
 */
export function completionsToDeepseekResponse(response: any): any {
  return response;
}
