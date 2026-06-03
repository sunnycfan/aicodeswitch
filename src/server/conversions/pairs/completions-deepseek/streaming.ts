/**
 * DeepSeek SSE → Completions SSE direct streaming conversion.
 *
 * Both formats use identical SSE chunks (chat.completion.chunk).
 * DeepSeek adds reasoning_content in delta.
 * Direct passthrough — no conversion needed, events are identical.
 */

import type { StreamConverter, SSEEvent } from '../../types.js';

/**
 * Passthrough converter: DeepSeek SSE → Completions SSE.
 * Both use chat.completion.chunk format with identical structure.
 */
export class DeepseekToCompletionsConverter implements StreamConverter {
  convertEvent(event: SSEEvent): SSEEvent[] {
    return [event];
  }
  flush(): SSEEvent[] {
    return [];
  }
}
