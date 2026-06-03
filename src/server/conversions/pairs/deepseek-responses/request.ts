/**
 * DeepSeek → Responses API composite request conversion.
 *
 * Composes: deepseek → completions → responses
 */

import { deepseekToCompletions } from '../deepseek-completions/request.js';
import { completionsToResponses } from '../completions-responses/request.js';

/**
 * Convert DeepSeek request to Responses API request.
 * Path: deepseek → completions → responses
 */
export function deepseekToResponsesRequest(body: any): any {
  const completionsBody = deepseekToCompletions(body);
  return completionsToResponses(completionsBody);
}
