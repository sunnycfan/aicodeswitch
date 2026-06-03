/**
 * Composite streaming converter: DeepSeek SSE → Gemini SSE.
 *
 * Chains: DeepseekToCompletionsConverter → CompletionsToGeminiConverter
 * Since DeepSeek and Completions share the same SSE format,
 * the DeepSeek converter is a passthrough, so the effective chain is:
 * DeepSeek SSE → Completions SSE → Gemini SSE
 */

import type { StreamConverter, SSEEvent } from '../../types.js';
import { DeepseekToCompletionsConverter } from '../completions-deepseek/streaming.js';
import { CompletionsToGeminiConverter } from '../gemini-completions/streaming.js';
import { flushConverter } from '../../utils/streaming-helpers.js';

/**
 * Composite converter: DeepSeek SSE → Completions SSE → Gemini SSE
 */
export class DeepseekToGeminiConverter implements StreamConverter {
  private first: StreamConverter;
  private second: StreamConverter;

  constructor() {
    this.first = new DeepseekToCompletionsConverter();
    this.second = new CompletionsToGeminiConverter();
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
