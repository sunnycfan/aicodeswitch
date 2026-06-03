/**
 * DeepSeek → OpenAI Chat Completions streaming conversion.
 *
 * Both formats use identical SSE chunks (chat.completion.chunk).
 * DeepSeek adds reasoning_content in delta.
 * Direct passthrough — no conversion needed, events are identical.
 */

import type { StreamConverter, SSEEvent } from '../../types.js';

/**
 * Passthrough converter: Completions SSE → DeepSeek SSE.
 * Both use chat.completion.chunk format with identical structure.
 */
export class CompletionsToDeepseekConverter implements StreamConverter {
  convertEvent(event: SSEEvent): SSEEvent[] {
    return [event];
  }
  flush(): SSEEvent[] {
    return [];
  }
}
