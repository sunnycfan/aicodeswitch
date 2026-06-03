import { Transform } from 'stream';
import { StringDecoder } from 'string_decoder';

/**
 * SSEEvent - 表��一个完整的SSE事件
 */
export interface SSEEvent {
  event?: string;
  id?: string;
  data?: any;
}

/**
 * 检测是否是客户端断开相关的错误（这些错误是正常的，不应记录为错误）
 */
function isClientDisconnectError(error: any): boolean {
  const code = error?.code;
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  return (
    code === 'ERR_STREAM_PREMATURE_CLOSE' ||
    code === 'ERR_STREAM_UNABLE_TO_PIPE' ||
    code === 'ERR_STREAM_DESTROYED' ||
    message.includes('premature close')
  );
}

export class SSEParserTransform extends Transform {
  private buffer = '';
  private currentEvent: SSEEvent = {};
  private dataLines: string[] = [];
  private errorEmitted = false;
  private stringDecoder = new StringDecoder('utf8');

  constructor() {
    super({ readableObjectMode: true });
    // 捕获流中的未处理错误，防止进程崩溃
    this.on('error', (err) => {
      if (isClientDisconnectError(err)) {
        console.warn('[SSEParserTransform] Stream closed (client disconnected)');
      } else {
        console.error('[SSEParserTransform] Stream error:', err);
      }
      this.errorEmitted = true;
    });
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    if (this.errorEmitted) {
      callback();
      return;
    }

    try {
      // 使用 StringDecoder 正确处理多字节字符边界，避免中文乱码
      this.buffer += this.stringDecoder.write(chunk);
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        this.processLine(line);
      }
      callback();
    } catch (error) {
      console.error('[SSEParserTransform] Error in _transform:', error);
      // 不传递错误，避免中断流，而是记录并继续
      callback();
    }
  }

  _flush(callback: (error?: Error | null) => void) {
    try {
      // 处理 StringDecoder 中剩余的字节
      const remaining = this.stringDecoder.end();
      if (remaining) {
        this.buffer += remaining;
      }
      if (this.buffer.length > 0) {
        this.processLine(this.buffer.replace(/\r$/, ''));
        this.flushEvent();
      }
      callback();
    } catch (error) {
      console.error('[SSEParserTransform] Error in _flush:', error);
      callback();
    }
  }

  private processLine(line: string) {
    if (!line.trim()) {
      this.flushEvent();
      return;
    }

    if (line.startsWith('event:')) {
      this.currentEvent.event = line.slice(6).trim();
      return;
    }

    if (line.startsWith('id:')) {
      this.currentEvent.id = line.slice(3).trim();
      return;
    }

    if (line.startsWith('data:')) {
      const rawValue = line.slice(5).replace(/\r$/, '');
      // SSE 规范仅移除 "data:" 后的一个可选空格，不能使用 trim 破坏原始内容
      this.dataLines.push(rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue);
    }
  }

  private flushEvent() {
    if (!this.currentEvent.event && this.dataLines.length === 0 && !this.currentEvent.id) {
      return;
    }

    if (this.dataLines.length > 0) {
      const data = this.dataLines.join('\n');
      if (data === '[DONE]') {
        this.currentEvent.data = { type: 'done' };
      } else {
        try {
          this.currentEvent.data = JSON.parse(data);
        } catch {
          this.currentEvent.data = data;
        }
      }
    }

    this.push(this.currentEvent);
    this.currentEvent = {};
    this.dataLines = [];
  }
}

export class SSESerializerTransform extends Transform {
  private errorEmitted = false;

  constructor() {
    super({
      writableObjectMode: true,  // 接收对象
      readableObjectMode: false, // 输出字符串/Buffer
    });

    this.on('error', (err) => {
      if (isClientDisconnectError(err)) {
        console.warn('[SSESerializerTransform] Stream closed (client disconnected)');
      } else {
        console.error('[SSESerializerTransform] Stream error:', err);
      }
      this.errorEmitted = true;
    });
  }

  _transform(event: SSEEvent, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    if (this.errorEmitted) {
      callback();
      return;
    }

    try {
      let output = '';
      const isDoneEvent = event.data?.type === 'done';
      if (event.event && !isDoneEvent) {
        output += `event: ${event.event}\n`;
      }
      if (event.id && !isDoneEvent) {
        output += `id: ${event.id}\n`;
      }
      if (event.data !== undefined) {
        let dataToSerialize = event.data;
        // OpenAI Responses 事件通常需要在 data 内包含 type 字段，便于客户端按规范解析
        if (
          event.event &&
          dataToSerialize &&
          typeof dataToSerialize === 'object' &&
          !Array.isArray(dataToSerialize) &&
          dataToSerialize.type === undefined
        ) {
          dataToSerialize = { type: event.event, ...dataToSerialize };
        }

        if (dataToSerialize?.type === 'done') {
          output += 'data: [DONE]\n';
        } else if (typeof dataToSerialize === 'string') {
          output += `data: ${dataToSerialize}\n`;
        } else {
          output += `data: ${JSON.stringify(dataToSerialize)}\n`;
        }
      }
      output += '\n';
      this.push(output);
      callback();
    } catch (error) {
      console.error('[SSESerializerTransform] Error in _transform:', error);
      callback();
    }
  }

  _flush(callback: (error?: Error | null) => void) {
    // 如果 [DONE] 已经发送，不需要额外操作
    // Node.js 会自动关闭流
    callback();
  }
}
