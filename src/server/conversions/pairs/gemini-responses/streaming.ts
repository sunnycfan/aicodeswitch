/**
 * Composite streaming converter: Responses API SSE → Gemini SSE.
 *
 * Chains: ResponsesToCompletionsConverter → CompletionsToGeminiConverter
 */

import type { StreamConverter, SSEEvent } from '../../types.js';
import { ResponsesToCompletionsConverter } from '../completions-responses/streaming.js';
import { CompletionsToGeminiConverter } from '../gemini-completions/streaming.js';
import { flushConverter } from '../../utils/streaming-helpers.js';

/**
 * Composite converter: Responses API SSE → Completions SSE → Gemini SSE
 */
export class ResponsesToGeminiConverter implements StreamConverter {
  private first: StreamConverter;
  private second: StreamConverter;

  constructor() {
    this.first = new ResponsesToCompletionsConverter();
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
