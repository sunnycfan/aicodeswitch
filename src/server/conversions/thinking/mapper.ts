/**
 * Thinking content mapping across API formats.
 */

/** Claude thinking text → reasoning_content string */
export function thinkingToReasoningContent(thinking: string): string {
  return thinking;
}

/** reasoning_content string → Claude thinking block */
export function reasoningContentToThinking(content: string): { type: 'thinking'; thinking: string } {
  return { type: 'thinking', thinking: content };
}

/** Responses API reasoning summary → Claude thinking block */
export function reasoningToThinking(summary: any[]): { type: 'thinking'; thinking: string } {
  const text = summary
    .filter((s: any) => s.type === 'summary_text')
    .map((s: any) => s.text || '')
    .join('');
  return { type: 'thinking', thinking: text || '' };
}

/** Claude thinking text → Responses API reasoning summary array */
export function thinkingToReasoningSummary(thinking: string): any[] {
  return [{ type: 'summary_text', text: thinking }];
}

/** Fix history messages: ensure thinking/reasoning_content is present alongside tool use */
export function fixThinkingHistory(messages: any[], format: 'claude' | 'completions'): any[] {
  return messages.map(msg => {
    if (msg.role !== 'assistant') return msg;

    const hasToolUse =
      (format === 'claude' && msg.content?.some?.((b: any) => b.type === 'tool_use')) ||
      (format === 'completions' && (msg.tool_calls?.length > 0));

    if (!hasToolUse) return msg;

    if (format === 'claude') {
      const hasThinking = msg.content?.some?.((b: any) => b.type === 'thinking');
      if (!hasThinking) {
        return {
          ...msg,
          content: [{ type: 'thinking', thinking: 'tool call' }, ...(msg.content || [])],
        };
      }
    } else {
      if (!msg.reasoning_content) {
        return { ...msg, reasoning_content: 'tool call' };
      }
    }

    return msg;
  });
}

/** Placeholder for redacted thinking blocks */
export function redactedThinkingPlaceholder(): string {
  return '[redacted thinking]';
}
