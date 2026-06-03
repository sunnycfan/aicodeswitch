/**
 * Shared streaming helper utilities.
 */

import type { StreamConverter, SSEEvent } from '../types.js';

/** Flush a converter's internal buffer, returning any remaining events. */
export function flushConverter(converter: StreamConverter): SSEEvent[] {
  return converter.flush?.() ?? [];
}

/** Normalize tool arguments fragment to string. */
export function normalizeToolArgumentsFragment(argumentsValue: unknown): string {
  if (argumentsValue === undefined || argumentsValue === null) return '';
  if (typeof argumentsValue === 'string') return argumentsValue;
  return JSON.stringify(argumentsValue);
}

/** Serialize an SSEEvent into wire-format SSE text block. */
export function serializeSSE(event: SSEEvent): string {
  let result = '';
  if (event.event !== undefined && event.event !== null) {
    result += `event: ${event.event}\n`;
  }
  if (event.id) {
    result += `id: ${event.id}\n`;
  }
  const dataStr = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
  result += `data: ${dataStr}\n\n`;
  return result;
}

/**
 * 解析 SSE event data：如果已是对象直接返回，否则 JSON.parse。
 * 兼容 legacy SSEParserTransform 输出的对象 data 和字符串 data。
 */
export function parseEventData(data: any): any {
  if (data === undefined || data === null) return data;
  if (typeof data === 'string') {
    if (data === '[DONE]') return { type: 'done' };
    try { return JSON.parse(data); } catch { return data; }
  }
  return data;  // 已经是对象
}

/** 创建输出 SSEEvent：data 直接设为对象 */
export function createOutputEvent(type: string | undefined, data: any, id?: string): SSEEvent {
  return { event: type, data, id };
}
