import { randomUUID } from 'crypto';

/** Generate a Claude message ID: msg_<uuid> */
export function generateMessageId(): string {
  return `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

/** Generate a Claude tool use ID: toolu_<uuid> */
export function generateToolUseId(): string {
  return `toolu_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

/** Generate an OpenAI Chat completion ID: chatcmpl-<uuid> */
export function generateCompletionsId(): string {
  return `chatcmpl-${randomUUID().replace(/-/g, '')}`;
}

/** Generate an OpenAI Responses API ID: resp_<uuid> */
export function generateResponseId(): string {
  return `resp_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

/** Generate a generic call ID for Responses API function calls */
export function generateCallId(): string {
  return `call_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

/** Generate a Gemini synthetic tool call ID */
export function generateGeminiSynthId(): string {
  return `gemini_synth_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}
