/**
 * Responses API → Gemini composite response conversion.
 *
 * Composes: responses → completions → gemini
 */

import { responsesToCompletionsResponse } from '../completions-responses/response.js';
import { completionsToGeminiResponse } from '../gemini-completions/response.js';

/**
 * Convert a Responses API response to a Gemini response.
 * Path: responses → completions → gemini
 */
export function responsesToGeminiResponse(response: any): any {
  const completionsResponse = responsesToCompletionsResponse(response);
  return completionsToGeminiResponse(completionsResponse);
}
