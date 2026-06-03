/**
 * DeepSeek → Responses API composite response conversion.
 *
 * Composes: deepseek → completions → responses
 */

import { deepseekToCompletionsResponse } from '../completions-deepseek/response.js';
import { completionsToResponsesResponse } from '../responses-completions/response.js';

/**
 * Convert DeepSeek response to Responses API response.
 * Path: deepseek → completions → responses
 */
export function deepseekToResponsesResponse(response: any): any {
  const completionsResponse = deepseekToCompletionsResponse(response);
  return completionsToResponsesResponse(completionsResponse);
}
