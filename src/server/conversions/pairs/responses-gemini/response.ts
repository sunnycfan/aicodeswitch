/**
 * Gemini → Responses API composite response conversion.
 *
 * Composes: gemini → completions → responses
 */

import { geminiToCompletionsResponse } from '../completions-gemini/response.js';
import { completionsToResponsesResponse } from '../responses-completions/response.js';

/**
 * Convert Gemini response to Responses API response.
 * Path: gemini → completions → responses
 */
export function geminiToResponsesResponse(response: any): any {
  const completionsResponse = geminiToCompletionsResponse(response);
  return completionsToResponsesResponse(completionsResponse);
}
