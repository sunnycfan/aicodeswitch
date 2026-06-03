/**
 * Gemini → DeepSeek composite response conversion.
 *
 * Composes: gemini → completions (passthrough) → deepseek
 * Since DeepSeek uses the same base format as Chat Completions,
 * the completions→deepseek step is identity.
 */

import { geminiToCompletionsResponse } from '../completions-gemini/response.js';

/**
 * Convert a Gemini response to a DeepSeek response.
 * Path: gemini → completions format, which is identical to DeepSeek format
 */
export function geminiToDeepseekResponse(response: any): any {
  return geminiToCompletionsResponse(response);
}
