import { Transform } from 'stream';
import { StringDecoder } from 'string_decoder';

/**
 * 流式 SSE 响应中的 model 字段回写 Transform。
 *
 * 插入位置：SSESerializerTransform 之后、ChunkCollectorTransform 之前。
 * 输入/输出均为 text mode（字符串），通过正则替换 SSE data 行中的
 * "model":"上游模型名" → "model":"客户端原始模型名"。
 */
export class ModelRewriteTransform extends Transform {
  private modelRegex: RegExp;
  private replacement: string;
  private modelVersionRegex: RegExp | null = null;
  private modelVersionReplacement: string | null = null;
  private stringDecoder = new StringDecoder('utf8');
  private buffer = '';

  constructor(originalModel: string) {
    super({
      writableObjectMode: false, // 接收序列化后的文本
      readableObjectMode: false, // 输出文本
    });

    // 转义原始模型名中的特殊字符，防止 JSON 注入
    const escaped = originalModel.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    this.replacement = `"model":"${escaped}"`;
    this.modelRegex = /"model"\s*:\s*"[^"]*"/g;

    // 处理 Gemini 直通场景中的 modelVersion 字段
    if (originalModel) {
      this.modelVersionReplacement = `"modelVersion":"${escaped}"`;
      this.modelVersionRegex = /"modelVersion"\s*:\s*"[^"]*"/g;
    }
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    try {
      this.buffer += this.stringDecoder.write(chunk);
      // 按行处理（SSE 协议以 \n 分隔）
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        this.push(this.rewriteLine(line) + '\n');
      }
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  _flush(callback: (error?: Error | null) => void) {
    try {
      const remaining = this.stringDecoder.end();
      if (remaining) this.buffer += remaining;
      if (this.buffer) {
        this.push(this.rewriteLine(this.buffer));
      }
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  private rewriteLine(line: string): string {
    // 只处理 SSE data 行
    if (!line.startsWith('data:')) return line;

    let result = line;
    // 重置正则 lastIndex（因为带 g 标志）
    this.modelRegex.lastIndex = 0;
    result = result.replace(this.modelRegex, this.replacement);

    if (this.modelVersionRegex && this.modelVersionReplacement) {
      this.modelVersionRegex.lastIndex = 0;
      result = result.replace(this.modelVersionRegex, this.modelVersionReplacement);
    }
    return result;
  }
}

/**
 * 非流式响应中的 model 字段回写。
 *
 * 将响应对象的 model（以及 Gemini 的 modelVersion）改写为客户端原始模型名。
 * 直接修改传入对象（原地修改）。
 */
export function rewriteResponseModel(responseData: any, originalModel: string): void {
  if (!responseData || !originalModel || typeof responseData !== 'object') return;

  // 所有格式在转换后统一使用 "model" 字段
  if ('model' in responseData) {
    responseData.model = originalModel;
  }

  // Gemini 直通场景可能保留 modelVersion
  if ('modelVersion' in responseData) {
    responseData.modelVersion = originalModel;
  }
}
