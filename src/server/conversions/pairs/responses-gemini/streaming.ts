/**
 * Composite streaming converter: Gemini SSE → Responses API SSE.
 *
 * Chains: GeminiToCompletionsConverter → CompletionsToResponsesConverter
 */

import type { StreamConverter, SSEEvent } from '../../types.js';
import { GeminiToCompletionsConverter } from '../completions-gemini/streaming.js';
import { CompletionsToResponsesConverter } from '../responses-completions/streaming.js';
import { flushConverter } from '../../utils/streaming-helpers.js';

/**
 * Composite converter: Gemini SSE → Completions SSE → Responses API SSE
 */
export class GeminiToResponsesConverter implements StreamConverter {
  private first: StreamConverter;
  private second: StreamConverter;

  constructor() {
    this.first = new GeminiToCompletionsConverter();
    this.second = new CompletionsToResponsesConverter();
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
