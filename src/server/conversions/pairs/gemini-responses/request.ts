/**
 * Gemini → Responses API composite request conversion.
 *
 * Composes: gemini → completions → responses
 */

import { geminiToCompletions } from '../gemini-completions/request.js';
import { completionsToResponses } from '../completions-responses/request.js';

/**
 * Convert a Gemini request to a Responses API request.
 * Path: gemini → completions → responses
 */
export function geminiToResponsesRequest(body: any): any {
  const completionsBody = geminiToCompletions(body);
  return completionsToResponses(completionsBody);
}
