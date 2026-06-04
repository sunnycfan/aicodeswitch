/**
 * StreamConverterAdapter — 将 conversions StreamConverter 桥接为 Node.js Transform 流。
 *
 * 新系统的 StreamConverter 是纯对象接口（convertEvent/flush），
 * 而代理管道使用 Node.js Transform 流通过 stream.pipeline() 串联。
 * 此 adapter 在两者之间做透明桥接。
 */

import { Transform, TransformCallback } from 'stream';
import type { SSEEvent, StreamConverter } from './types.js';

export class StreamConverterAdapter extends Transform {
  constructor(private converter: StreamConverter) {
    super({ objectMode: true });
  }

  _transform(event: SSEEvent, _encoding: string, callback: TransformCallback): void {
    try {
      const convertedEvents = this.converter.convertEvent(event);
      for (const converted of convertedEvents) {
        this.push(converted);
      }
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  _flush(callback: TransformCallback): void {
    try {
      if (this.converter.flush) {
        const finalEvents = this.converter.flush();
        for (const converted of finalEvents) {
          this.push(converted);
        }
      }
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }
}
