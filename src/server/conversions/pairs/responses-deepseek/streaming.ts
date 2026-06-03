/**
 * Composite streaming converter: DeepSeek SSE → Responses API SSE.
 *
 * Chains: DeepseekToCompletionsConverter → CompletionsToResponsesConverter
 */

import type { StreamConverter, SSEEvent } from '../../types.js';
import { DeepseekToCompletionsConverter } from '../completions-deepseek/streaming.js';
import { CompletionsToResponsesConverter } from '../responses-completions/streaming.js';
import { flushConverter } from '../../utils/streaming-helpers.js';

/**
 * Composite converter: DeepSeek SSE → Completions SSE → Responses API SSE
 */
export class DeepseekToResponsesConverter implements StreamConverter {
  private first: StreamConverter;
  private second: StreamConverter;

  constructor() {
    this.first = new DeepseekToCompletionsConverter();
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
