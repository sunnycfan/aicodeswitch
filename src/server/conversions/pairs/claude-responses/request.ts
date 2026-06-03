/**
 * Claude Messages → OpenAI Responses API request conversion.
 */

import { claudeThinkingToResponsesReasoning } from '../../thinking/effort.js';
import { claudeToResponsesTools } from '../../utils/tool-schema.js';

/**
 * Convert a Claude Messages request body to an OpenAI Responses API request body.
 */
export function claudeToResponses(body: any): any {
  const input: any[] = [];

  // --- System prompt -> instructions ---
  let instructions: string | undefined;
  if (body.system) {
    instructions = typeof body.system === 'string'
      ? body.system
      : Array.isArray(body.system)
        ? body.system
            .filter((s: any) => s.type === 'text' || typeof s.text === 'string')
            .map((s: any) => s.text || '')
            .join('\n')
        : undefined;
    // Strip any x-anthropic-billing-header prefixes
    if (instructions) {
      instructions = instructions.replace(/^x-anthropic-billing-header[^\n]*\n?/gi, '');
    }
  }

  // --- Messages -> input array ---
  if (body.messages) {
    const buffer = new MessageBuffer();
    for (const msg of body.messages) {
      buffer.setCurrentRole(msg.role);
      const content = msg.content;
      if (typeof content === 'string') {
        buffer.addText(content);
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            buffer.addText(block.text);
          } else if (block.type === 'image') {
            buffer.addImage(block);
          } else if (block.type === 'tool_use') {
            // Flush buffered content first, then emit standalone function_call
            buffer.flush(input);
            input.push({
              type: 'function_call',
              call_id: block.id,
              name: block.name,
              arguments: typeof block.input === 'string' ? block.input : JSON.stringify(block.input),
            });
          } else if (block.type === 'tool_result') {
            // Flush buffered content first, then emit standalone function_call_output
            buffer.flush(input);
            const outputContent = typeof block.content === 'string'
              ? block.content
              : JSON.stringify(block.content);
            input.push({
              type: 'function_call_output',
              call_id: block.tool_use_id,
              output: outputContent,
            });
          } else if (block.type === 'thinking' || block.type === 'redacted_thinking') {
            // Skip thinking blocks
            continue;
          }
        }
      }
    }
    // Flush any remaining buffered content
    buffer.flush(input);
  }

  // --- Build result ---
  const result: any = {
    model: body.model,
    input,
    stream: body.stream ?? false,
  };

  if (instructions) result.instructions = instructions;
  if (body.max_tokens) result.max_output_tokens = body.max_tokens;
  if (body.temperature !== undefined) result.temperature = body.temperature;
  if (body.top_p !== undefined) result.top_p = body.top_p;

  // --- Thinking -> reasoning ---
  if (body.thinking) {
    const reasoning = claudeThinkingToResponsesReasoning(body.thinking);
    if (reasoning) {
      result.reasoning = reasoning;
    }
  }

  // --- Tools ---
  if (body.tools && body.tools.length > 0) {
    result.tools = claudeToResponsesTools(body.tools);
  }

  // --- Tool choice mapping ---
  if (body.tool_choice) {
    result.tool_choice = mapClaudeToolChoice(body.tool_choice);
  }

  // Note: stop_sequences are dropped (not supported in Responses API)

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Buffer for accumulating text/image content into a single message before
 * flushing when encountering standalone items like function_call / function_call_output.
 */
class MessageBuffer {
  private currentRole: string | null = null;
  private content: any[] = [];

  setCurrentRole(role: string): void {
    // If role changed, flush what we have
    if (this.currentRole !== null && this.currentRole !== role && this.content.length > 0) {
      // Role changed — caller should flush first, but for safety we just track
    }
    this.currentRole = role;
  }

  addText(text: string): void {
    if (!this.currentRole) return;
    const textType = this.currentRole === 'assistant' ? 'output_text' : 'input_text';
    this.content.push({ type: textType, text });
  }

  addImage(block: any): void {
    if (!this.currentRole) return;
    this.content.push({
      type: 'input_image',
      image_url: `data:${block.source?.media_type || block.media_type || 'image/png'};base64,${block.source?.data || block.data}`,
    });
  }

  flush(target: any[]): void {
    if (this.content.length === 0 || !this.currentRole) {
      this.content = [];
      return;
    }
    const role = this.currentRole;
    target.push({ role, content: this.content });
    this.content = [];
  }
}

/**
 * Map Claude tool_choice to Responses API tool_choice.
 */
function mapClaudeToolChoice(toolChoice: any): any {
  if (!toolChoice) return undefined;
  if (typeof toolChoice === 'string') {
    switch (toolChoice) {
      case 'any': return 'required';
      case 'auto': return 'auto';
      case 'none': return 'none';
      default: return 'auto';
    }
  }
  if (toolChoice.type === 'any') return 'required';
  if (toolChoice.type === 'auto') return 'auto';
  if (toolChoice.type === 'none') return 'none';
  if (toolChoice.type === 'tool') {
    return { type: 'function', name: toolChoice.name };
  }
  return 'auto';
}
