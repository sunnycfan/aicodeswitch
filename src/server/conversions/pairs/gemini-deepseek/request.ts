/**
 * Gemini → DeepSeek composite request conversion.
 *
 * Composes: gemini → completions (internal) → deepseek
 */

import { geminiToCompletions } from '../gemini-completions/request.js';
import { completionsToDeepseek } from '../completions-deepseek/request.js';

/**
 * Convert a Gemini request to a DeepSeek request.
 * Path: gemini → completions (internal) → deepseek
 */
export function geminiToDeepseek(body: any): any {
  const completionsBody = geminiToCompletions(body);
  return completionsToDeepseek(completionsBody);
}
