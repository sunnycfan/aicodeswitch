/**
 * Composite streaming converter: Gemini SSE → DeepSeek SSE.
 *
 * Chains: GeminiToCompletionsConverter → CompletionsToDeepseekConverter
 * Since DeepSeek and Completions share the same SSE format,
 * the CompletionsToDeepseekConverter is a passthrough, so the effective
 * chain is: Gemini SSE → Completions SSE (direct, stateful conversion).
 */

import type { StreamConverter, SSEEvent } from '../../types.js';
import { GeminiToCompletionsConverter } from '../completions-gemini/streaming.js';
import { CompletionsToDeepseekConverter } from '../deepseek-completions/streaming.js';
import { flushConverter } from '../../utils/streaming-helpers.js';

/**
 * Composite converter: Gemini SSE → Completions SSE → DeepSeek SSE
 */
export class GeminiToDeepseekConverter implements StreamConverter {
  private first: StreamConverter;
  private second: StreamConverter;

  constructor() {
    this.first = new GeminiToCompletionsConverter();
    this.second = new CompletionsToDeepseekConverter();
  }

  convertEvent(event: SSEEvent): SSEEvent[] {
    const intermediate = this.first.convertEvent(event);
    return intermediate.flatMap((e: SSEEvent) => this.second.convertEvent(e));
  }

  flush(): SSEEvent[] {
    const intermediate = flushConverter(this.first);
    const secondFromIntermediate = intermediate.flatMap((e: SSEEvent) => this.second.convertEvent(e));
    const secondFlush = flushConverter(this.second);
    return [...secondFromIntermediate, ...secondFlush];
  }
}
