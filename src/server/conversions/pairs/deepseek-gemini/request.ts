/**
 * DeepSeek → Gemini composite request conversion.
 *
 * Composes: deepseek → completions (passthrough) → gemini
 * Since DeepSeek uses the same base format as Chat Completions,
 * the deepseek→completions step is identity.
 */

import { deepseekToCompletions } from '../deepseek-completions/request.js';
import { completionsToGemini } from '../completions-gemini/request.js';

/**
 * Convert a DeepSeek request to a Gemini request.
 * Path: deepseek → completions (internal) → gemini
 */
export function deepseekToGemini(body: any): any {
  const completionsBody = deepseekToCompletions(body);
  return completionsToGemini(completionsBody);
}
