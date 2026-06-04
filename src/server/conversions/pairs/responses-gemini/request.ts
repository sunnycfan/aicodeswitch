/**
 * Responses API → Gemini composite request conversion.
 *
 * Composes: responses → completions → gemini
 */

import { responsesToCompletions } from '../responses-completions/request.js';
import { completionsToGemini } from '../completions-gemini/request.js';

/**
 * Convert Responses API request to Gemini request.
 * Path: responses → completions → gemini
 */
export function responsesToGeminiRequest(body: any): any {
  const completionsBody = responsesToCompletions(body);
  return completionsToGemini(completionsBody);
}
