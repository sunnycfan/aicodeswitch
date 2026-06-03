/**
 * Responses API → DeepSeek composite response conversion.
 *
 * Composes: responses → completions → deepseek
 */

import { responsesToCompletionsResponse } from '../completions-responses/response.js';
import { completionsToDeepseekResponse } from '../deepseek-completions/response.js';

/**
 * Convert Responses API response to DeepSeek response.
 * Path: responses → completions → deepseek
 */
export function responsesToDeepseekResponse(response: any): any {
  const completionsResponse = responsesToCompletionsResponse(response);
  return completionsToDeepseekResponse(completionsResponse);
}
