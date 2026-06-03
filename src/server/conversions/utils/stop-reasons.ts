/**
 * Stop reason / finish reason / status mapping across all API formats.
 */

// --- OpenAI Chat Completions ↔ Claude Messages ---

export function completionsToClaudeStopReason(reason: string | null | undefined): string {
  if (!reason) return 'end_turn';
  switch (reason) {
    case 'tool_calls':
    case 'function_call':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    default:
      return 'end_turn';
  }
}

export function claudeToCompletionsStopReason(reason: string | null | undefined): string {
  if (!reason) return 'stop';
  switch (reason) {
    case 'tool_use':
      return 'tool_calls';
    case 'max_tokens':
      return 'length';
    case 'end_turn':
      return 'stop';
    default:
      return 'stop';
  }
}

// --- Gemini ↔ Claude Messages ---

export function geminiToClaudeStopReason(reason: string | null | undefined): string {
  if (!reason) return 'end_turn';
  switch (reason) {
    case 'MAX_TOKENS':
      return 'max_tokens';
    case 'STOP':
    default:
      return 'end_turn';
  }
}

export function claudeToGeminiStopReason(reason: string | null | undefined): string {
  if (!reason) return 'STOP';
  switch (reason) {
    case 'max_tokens':
      return 'MAX_TOKENS';
    case 'end_turn':
    case 'tool_use':
    default:
      return 'STOP';
  }
}

// --- OpenAI Responses API ↔ Claude Messages ---

export function responsesToClaudeStopReason(
  status: string | null | undefined,
  incompleteReason?: string | null,
  hasToolUse?: boolean,
): string {
  if (!status || status === 'completed') {
    return hasToolUse ? 'tool_use' : 'end_turn';
  }
  if (status === 'incomplete') {
    if (incompleteReason === 'max_output_tokens' || incompleteReason === 'max_tokens') {
      return 'max_tokens';
    }
    return 'end_turn';
  }
  return 'end_turn';
}

export function claudeToResponsesStatus(
  reason: string | null | undefined,
): { status: string; incomplete_details?: { reason: string } } {
  if (reason === 'max_tokens') {
    return { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } };
  }
  return { status: 'completed' };
}

// --- OpenAI Chat ↔ Responses API ---

export function completionsToResponsesFinishReason(reason: string | null | undefined): string {
  if (reason === 'length') return 'incomplete';
  return 'completed';
}

export function responsesToCompletionsFinishReason(status: string | null | undefined): string | null {
  if (status === 'incomplete') return 'length';
  return 'stop';
}

