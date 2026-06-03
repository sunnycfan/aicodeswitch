/**
 * DeepSeek → Completions (Chat Completions) direct request conversion.
 *
 * Both formats share the same Chat Completions base structure.
 * Direct conversion preserves all fields without intermediate loss.
 */

/**
 * Convert a DeepSeek request to a Chat Completions request.
 *
 * Direct mapping: both formats are identical Chat Completions.
 * Preserves reasoning_content and all DeepSeek-specific fields.
 */
export function deepseekToCompletions(body: any): any {
  // Both formats are identical Chat Completions — passthrough
  return body;
}
