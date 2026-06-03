/**
 * Responses API → DeepSeek composite request conversion.
 *
 * Composes: responses → completions → deepseek
 */

import { responsesToCompletions } from '../responses-completions/request.js';
import { completionsToDeepseek } from '../completions-deepseek/request.js';

/**
 * Convert Responses API request to DeepSeek request.
 * Path: responses → completions → deepseek
 */
export function responsesToDeepseekRequest(body: any): any {
  const completionsBody = responsesToCompletions(body);
  return completionsToDeepseek(completionsBody);
}
