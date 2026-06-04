/**
 * SSE streaming pipeline for the conversion system.
 *
 * Wraps the conversion StreamConverter in an async generator pipeline
 * that handles SSE parsing, conversion, and serialization.
 */

import { Transform, TransformCallback, Readable } from 'stream';
import type { SSEEvent, StreamConverter, Format } from './types.js';
import { createStreamConverter } from './index.js';

/**
 * Serialize an SSEEvent to wire format.
 */
export function serializeSSE(event: SSEEvent): string {
  let result = '';
  if (event.event) result += `event: ${event.event}\n`;
  if (event.id) result += `id: ${event.id}\n`;
  const dataStr = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
  result += `data: ${dataStr}\n\n`;
  return result;
}

/**
 * Lightweight SSE event parser.
 */
export class SSEEventParser {
  private buffer = '';
  private currentEvent: Partial<SSEEvent> = {};

  pushChunk(chunk: Buffer | string): SSEEvent[] {
    this.buffer += chunk.toString();
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    return this.consumeLines(lines);
  }

  flush(): SSEEvent[] {
    if (!this.buffer) {
      return this.finishCurrentEvent();
    }
    const lines = this.buffer.split('\n');
    this.buffer = '';
    const events = this.consumeLines(lines);
    return events.concat(this.finishCurrentEvent());
  }

  private consumeLines(lines: string[]): SSEEvent[] {
    const events: SSEEvent[] = [];
    for (const rawLine of lines) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (line === '') {
        events.push(...this.finishCurrentEvent());
      } else if (line.startsWith('event: ')) {
        this.currentEvent.event = line.substring(7);
      } else if (line.startsWith('id: ')) {
        this.currentEvent.id = line.substring(4);
      } else if (line.startsWith('data: ')) {
        this.currentEvent.data = (this.currentEvent.data || '') + line.substring(6);
      } else if (line.startsWith('data:')) {
        this.currentEvent.data = (this.currentEvent.data || '') + line.substring(5);
      }
    }
    return events;
  }

  private finishCurrentEvent(): SSEEvent[] {
    if (this.currentEvent.data === undefined) {
      this.currentEvent = {};
      return [];
    }
    const event = this.currentEvent as SSEEvent;
    this.currentEvent = {};
    return [event];
  }
}

/**
 * Node.js Transform stream that parses SSE bytes into SSEEvent objects.
 */
class SSEParserTransform extends Transform {
  private parser = new SSEEventParser();

  constructor() {
    super({ objectMode: true });
  }

  _transform(chunk: Buffer | string, _encoding: string, callback: TransformCallback): void {
    const events = this.parser.pushChunk(chunk);
    for (const event of events) {
      this.push(event);
    }
    callback();
  }

  _flush(callback: TransformCallback): void {
    const events = this.parser.flush();
    for (const event of events) {
      this.push(event);
    }
    callback();
  }
}

/**
 * Convert a Web ReadableStream to a Node.js Readable.
 */
function toNodeReadable(stream: NodeJS.ReadableStream | ReadableStream<any>): NodeJS.ReadableStream {
  if (stream instanceof ReadableStream) {
    const reader = stream.getReader();
    return new Readable({
      async read() {
        try {
          const { done, value } = await reader.read();
          if (done) this.push(null);
          else this.push(value);
        } catch (e: any) {
          this.destroy(e);
        }
      },
    });
  }
  return stream;
}

/**
 * Check if the format pair should use raw passthrough (no conversion needed).
 */
function shouldPassthroughRaw(fromFormat: Format, toFormat: Format): boolean {
  return fromFormat === toFormat;
}

/**
 * Creates a streaming pipeline that converts SSE events from one format to another.
 *
 * @param upstreamBody - The upstream response body stream
 * @param fromFormat - The upstream format (source)
 * @param toFormat - The client format (target)
 * @param onEvent - Optional callback for monitoring parsed events (e.g., usage tracking)
 * @returns AsyncGenerator yielding SSE-formatted string chunks
 */
export async function* createStreamPipeline(
  upstreamBody: NodeJS.ReadableStream | ReadableStream<any>,
  fromFormat: Format,
  toFormat: Format,
  onEvent?: (event: any) => void,
): AsyncGenerator<string | Buffer> {
  const nodeStream = toNodeReadable(upstreamBody);

  // Raw passthrough: same format, no conversion needed
  if (shouldPassthroughRaw(fromFormat, toFormat)) {
    const parser = onEvent ? new SSEEventParser() : null;

    for await (const chunk of nodeStream as AsyncIterable<Buffer | string>) {
      if (parser) {
        const parsedEvents = parser.pushChunk(typeof chunk === 'string' ? chunk : chunk.toString());
        for (const event of parsedEvents) {
          try {
            const parsed = event.data ? JSON.parse(event.data) : null;
            onEvent!(parsed);
          } catch { /* ignore */ }
        }
      }
      yield chunk;
    }

    if (parser) {
      for (const event of parser.flush()) {
        try {
          const parsed = event.data ? JSON.parse(event.data) : null;
          onEvent!(parsed);
        } catch { /* ignore */ }
      }
    }
    return;
  }

  // Conversion path: parse SSE → convert → serialize
  const parser = new SSEParserTransform();
  const eventStream = nodeStream.pipe(parser);

  const eventQueue: SSEEvent[] = [];
  let resolveEvent: ((value: SSEEvent | null) => void) | null = null;
  let done = false;

  eventStream.on('data', (event: SSEEvent) => {
    if (resolveEvent) {
      resolveEvent(event);
      resolveEvent = null;
    } else {
      eventQueue.push(event);
    }
  });

  eventStream.on('end', () => {
    done = true;
    if (resolveEvent) {
      resolveEvent(null);
      resolveEvent = null;
    }
  });

  eventStream.on('error', () => {
    done = true;
    if (resolveEvent) {
      resolveEvent(null);
      resolveEvent = null;
    }
  });

  const getNextEvent = (): Promise<SSEEvent | null> => {
    if (eventQueue.length > 0) return Promise.resolve(eventQueue.shift()!);
    if (done) return Promise.resolve(null);
    return new Promise<SSEEvent | null>((resolve) => {
      resolveEvent = resolve;
    });
  };

  const converter: StreamConverter = createStreamConverter({ fromFormat, toFormat });

  while (true) {
    const event = await getNextEvent();
    if (!event) break;

    if (onEvent) {
      try {
        const parsed = event.data ? JSON.parse(event.data) : null;
        onEvent(parsed);
      } catch { /* ignore */ }
    }

    const convertedEvents = converter.convertEvent(event);
    for (const converted of convertedEvents) {
      yield serializeSSE(converted);
    }
  }

  // Flush any remaining state from the converter
  if (converter.flush) {
    const finalEvents = converter.flush();
    for (const converted of finalEvents) {
      yield serializeSSE(converted);
    }
  }
}
