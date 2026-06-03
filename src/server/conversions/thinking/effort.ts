/**
 * Thinking parameter mapping across API formats.
 */

/** Maps Claude thinking config to reasoning_effort string */
export function claudeThinkingToReasoningEffort(thinking: any): string | null {
  if (!thinking || thinking.type === 'disabled') return null;

  // Priority: output_config.effort
  if (thinking.output_config?.effort) {
    return thinking.output_config.effort;
  }

  // Fallback: derive from type + budget_tokens
  if (thinking.type === 'adaptive') return 'xhigh';
  if (thinking.budget_tokens !== undefined) {
    if (thinking.budget_tokens < 4000) return 'low';
    if (thinking.budget_tokens < 16000) return 'medium';
    return 'high';
  }

  return 'medium';
}

/** Maps Claude thinking config to Responses API reasoning parameter */
export function claudeThinkingToResponsesReasoning(thinking: any): { effort: string } | null {
  const effort = claudeThinkingToReasoningEffort(thinking);
  if (!effort) return null;
  return { effort };
}

/** Reverse: reasoning_effort string → Claude thinking config */
export function reasoningEffortToClaudeThinking(effort: string | null): any {
  if (!effort) return undefined;

  switch (effort) {
    case 'low':
      return { type: 'enabled', budget_tokens: 2048 };
    case 'medium':
      return { type: 'enabled', budget_tokens: 8192 };
    case 'high':
      return { type: 'enabled', budget_tokens: 32000 };
    case 'xhigh':
      return { type: 'adaptive' };
    default:
      return { type: 'enabled', budget_tokens: 8192 };
  }
}

/** Convert Claude thinking config to DeepSeek thinking config */
export function deepseekThinkingConfig(thinking: any): any {
  if (!thinking || thinking.type === 'disabled') {
    return { thinking: { type: 'disabled' } };
  }
  return { thinking: { type: 'enabled' } };
}

/** Check if a model is an OpenAI o-series reasoning model */
export function isOSeriesModel(model: string): boolean {
  if (!model) return false;
  const lower = model.toLowerCase();
  return /\bo[1-9]\b/.test(lower) || /\bo4\b/.test(lower) || /\bgpt-?5\b/.test(lower);
}
