/**
 * Claude Messages → OpenAI Chat Completions request conversion.
 *
 * Enhanced with reasoning_content / thinking block support.
 */

import { isOSeriesModel, claudeThinkingToReasoningEffort } from '../../thinking/effort.js';
import { claudeToCompletionsTools } from '../../utils/tool-schema.js';

/**
 * Convert a Claude Messages request body to an OpenAI Chat Completions request body.
 *
 * @param preserveReasoningContent  When true, `thinking` / `redacted_thinking` blocks
 *                                  are surfaced as `reasoning_content` on assistant messages.
 */
export function claudeToCompletions(body: any, preserveReasoningContent = false): any {
  const messages: any[] = [];

  // --- System prompt -------------------------------------------------------
  if (body.system) {
    const systemContent = typeof body.system === 'string'
      ? body.system
      : Array.isArray(body.system)
        ? body.system
            .filter((s: any) => s.type === 'text' || typeof s.text === 'string')
            .map((s: any) => s.text || '')
            .join('\n')
        : '';
    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }
  }

  // --- Messages ------------------------------------------------------------
  if (body.messages) {
    for (const msg of body.messages) {
      const converted = convertClaudeMessageToCompletions(msg, preserveReasoningContent);
      const toolResults = converted._toolResults;
      delete converted._toolResults;
      messages.push(converted);
      // Emit tool_result blocks as separate 'tool' role messages (OpenAI format)
      if (toolResults) {
        for (const tr of toolResults) {
          messages.push(tr);
        }
      }
    }
  }

  // --- Build result --------------------------------------------------------
  const result: any = {
    model: body.model,
    messages,
    stream: body.stream || false,
  };

  // Parameter mapping
  if (body.max_tokens) result.max_tokens = body.max_tokens;
  if (body.temperature !== undefined) result.temperature = body.temperature;
  if (body.top_p !== undefined) result.top_p = body.top_p;
  if (body.stop_sequences) result.stop = body.stop_sequences;

  // Tool mapping (Claude input_schema → OpenAI parameters)
  if (body.tools && body.tools.length > 0) {
    result.tools = claudeToCompletionsTools(body.tools);
  }

  // --- O-series reasoning model handling -----------------------------------
  if (body.thinking && body.model && isOSeriesModel(body.model)) {
    // O-series models use max_completion_tokens instead of max_tokens
    if (result.max_tokens) {
      result.max_completion_tokens = result.max_tokens;
      delete result.max_tokens;
    }
    // Inject reasoning_effort derived from Claude thinking config
    const effort = claudeThinkingToReasoningEffort(body.thinking);
    if (effort) {
      result.reasoning_effort = effort;
    }
  }

  return result;
}

/**
 * Convert a single Claude message into an OpenAI message object.
 * Returns `{ role, content, tool_calls?, reasoning_content?, _toolResults? }`.
 */
function convertClaudeMessageToCompletions(
  msg: any,
  preserveReasoningContent: boolean,
): any {
  const content = msg.content;

  // String content – simple passthrough
  if (typeof content === 'string') {
    return { role: msg.role, content };
  }

  if (!Array.isArray(content)) {
    return { role: msg.role, content: String(content) };
  }

  const parts: string[] = [];
  const toolCalls: any[] = [];
  const toolResults: any[] = [];
  const reasoningParts: string[] = [];

  for (const block of content) {
    if (block.type === 'text') {
      parts.push(block.text);
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments:
            typeof block.input === 'string'
              ? block.input
              : JSON.stringify(block.input),
        },
      });
    } else if (block.type === 'tool_result') {
      const resultContent =
        typeof block.content === 'string'
          ? block.content
          : JSON.stringify(block.content);
      toolResults.push({
        role: 'tool',
        tool_call_id: block.tool_use_id,
        content: resultContent,
      });
    } else if (block.type === 'thinking') {
      if (preserveReasoningContent) {
        reasoningParts.push(block.thinking || '');
      }
      // otherwise skip
    } else if (block.type === 'redacted_thinking') {
      if (preserveReasoningContent) {
        reasoningParts.push('[redacted thinking]');
      }
      // otherwise skip
    }
  }

  // Assistant message with tool calls
  if (toolCalls.length > 0) {
    const result: any = {
      role: 'assistant',
      content: parts.join('\n') || null,
      tool_calls: toolCalls,
    };
    if (
      preserveReasoningContent &&
      msg.role === 'assistant' &&
      reasoningParts.length > 0
    ) {
      result.reasoning_content = reasoningParts.join('\n');
    }
    return result;
  }

  // User message with tool results – emit as separate tool messages
  if (toolResults.length > 0) {
    return {
      role: msg.role,
      content: parts.join('\n') || null,
      _toolResults: toolResults,
    };
  }

  // Plain message (may include reasoning_content for assistant)
  const result: any = {
    role: msg.role,
    content: parts.join('\n') || null,
  };

  if (
    preserveReasoningContent &&
    msg.role === 'assistant' &&
    reasoningParts.length > 0
  ) {
    result.reasoning_content = reasoningParts.join('\n');
  }

  return result;
}
