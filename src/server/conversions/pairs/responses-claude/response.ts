/**
 * Claude Messages → OpenAI Responses API response conversion.
 *
 * Converts a Claude Messages response body into an OpenAI Responses API response body.
 */

import { generateResponseId, generateCallId } from '../../utils/id.js';
import { claudeToResponsesStatus } from '../../utils/stop-reasons.js';
import { thinkingToReasoningSummary } from '../../thinking/mapper.js';

/**
 * Convert a Claude Messages response to an OpenAI Responses API response.
 */
export function claudeToResponsesResponse(response: any): any {
  const output: any[] = [];

  for (const block of (response.content || [])) {
    if (block.type === 'thinking') {
      output.push({
        type: 'reasoning',
        id: `rs_${generateCallId().slice(5)}`,
        summary: thinkingToReasoningSummary(block.thinking || ''),
      });
    } else if (block.type === 'text') {
      output.push({
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [{
          type: 'output_text',
          text: block.text,
          annotations: [],
        }],
      });
    } else if (block.type === 'tool_use') {
      output.push({
        type: 'function_call',
        status: 'completed',
        call_id: block.id,
        name: block.name,
        arguments: typeof block.input === 'string' ? block.input : JSON.stringify(block.input),
      });
    }
  }

  const { status, incomplete_details } = claudeToResponsesStatus(response.stop_reason);
  const usage = claudeToResponsesUsage(response.usage);
  const responseId = response.id || generateResponseId();

  return {
    id: responseId,
    object: 'response',
    status,
    output,
    model: response.model || '',
    created_at: Math.floor(Date.now() / 1000),
    usage,
    ...(incomplete_details ? { incomplete_details } : {}),
    metadata: {},
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map Claude usage to Responses API usage.
 */
function claudeToResponsesUsage(usage: any): any {
  if (!usage) return { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: input + output,
  };
}
