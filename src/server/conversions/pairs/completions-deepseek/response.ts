/**
 * DeepSeek → Completions (Chat Completions) direct response conversion.
 *
 * Both formats share the same Chat Completions response structure.
 * Direct passthrough preserves all fields including reasoning_content.
 */

/**
 * Convert a DeepSeek response to a Chat Completions response.
 *
 * Direct passthrough: both formats are identical Chat Completions.
 * reasoning_content is preserved as-is — it's a valid field in both formats.
 */
export function deepseekToCompletionsResponse(response: any): any {
  return response;
}
