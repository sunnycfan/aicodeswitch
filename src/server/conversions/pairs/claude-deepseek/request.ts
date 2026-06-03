/**
 * Claude Messages → DeepSeek Reasoning request conversion.
 *
 * Self-contained: does not depend on other pair directories.
 * DeepSeek uses the same wire format as OpenAI Chat Completions, but with:
 * - Different target path: /v1/chat/completions
 * - reasoning_content field for thinking output
 * - Different reasoning control parameters (thinking: {type: "enabled/disabled"})
 * - History messages require reasoning_content on assistant tool_use turns
 */

import { isOSeriesModel, claudeThinkingToReasoningEffort } from '../../thinking/effort.js';
import { deepseekThinkingConfig } from '../../thinking/effort.js';
import { claudeToCompletionsTools } from '../../utils/tool-schema.js';

/**
 * Convert Claude Messages request to DeepSeek Reasoning request.
 */
export function claudeToDeepSeek(body: any): any {
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
      const converted = convertClaudeMessage(msg);
      const toolResults = converted._toolResults;
      delete converted._toolResults;

      // When the message contains only tool_result blocks (no text),
      // converted.content is null – skip pushing the empty wrapper to avoid
      // sending an invalid { role: "user", content: null } message.
      const hasOnlyToolResults = toolResults && toolResults.length > 0 && converted.content === null;

      if (!hasOnlyToolResults) {
        messages.push(converted);
      }

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

  if (body.max_tokens) result.max_tokens = body.max_tokens;
  if (body.temperature !== undefined) result.temperature = body.temperature;
  if (body.top_p !== undefined) result.top_p = body.top_p;
  if (body.stop_sequences) result.stop = body.stop_sequences;

  if (body.tools && body.tools.length > 0) {
    result.tools = claudeToCompletionsTools(body.tools);
  }

  // --- O-series reasoning model handling -----------------------------------
  if (body.thinking && body.model && isOSeriesModel(body.model)) {
    if (result.max_tokens) {
      result.max_completion_tokens = result.max_tokens;
      delete result.max_tokens;
    }
    const effort = claudeThinkingToReasoningEffort(body.thinking);
    if (effort) {
      result.reasoning_effort = effort;
    }
  }

  // --- DeepSeek-specific thinking configuration ----------------------------
  if (body.thinking) {
    const thinkingConfig = deepseekThinkingConfig(body.thinking);
    Object.assign(result, thinkingConfig);
  }

  // Fix history: ensure assistant messages with tool_calls have reasoning_content
  if (Array.isArray(result.messages)) {
    result.messages = fixDeepSeekReasoningHistory(result.messages);
  }

  return result;
}

/**
 * Convert a single Claude message into a DeepSeek/Completions message object.
 * Always preserves reasoning_content (thinking → reasoning_content).
 */
function convertClaudeMessage(msg: any): any {
  const content = msg.content;

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
      reasoningParts.push(block.thinking || '');
    } else if (block.type === 'redacted_thinking') {
      reasoningParts.push('[redacted thinking]');
    }
  }

  if (toolCalls.length > 0) {
    const result: any = {
      role: 'assistant',
      content: parts.join('\n') || null,
      tool_calls: toolCalls,
    };
    if (msg.role === 'assistant' && reasoningParts.length > 0) {
      result.reasoning_content = reasoningParts.join('\n');
    }
    return result;
  }

  if (toolResults.length > 0) {
    return {
      role: msg.role,
      content: parts.join('\n') || null,
      _toolResults: toolResults,
    };
  }

  const result: any = {
    role: msg.role,
    content: parts.join('\n') || null,
  };

  if (msg.role === 'assistant' && reasoningParts.length > 0) {
    result.reasoning_content = reasoningParts.join('\n');
  }

  return result;
}

/**
 * Fix reasoning history for DeepSeek: ensure every assistant message
 * with tool_calls has a reasoning_content field (DeepSeek requirement).
 */
function fixDeepSeekReasoningHistory(messages: any[]): any[] {
  return messages.map(msg => {
    if (msg.role === 'assistant' && msg.tool_calls?.length > 0 && !msg.reasoning_content) {
      return { ...msg, reasoning_content: 'tool call' };
    }
    return msg;
  });
}
