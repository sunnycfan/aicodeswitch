/**
 * AICodingBus Unified Format Conversion System
 *
 * Provides conversion between 5 API formats:
 * 1. Claude Messages API
 * 2. OpenAI Responses API
 * 3. OpenAI Chat Completions API
 * 4. Gemini GenerateContent API
 * 5. DeepSeek Reasoning API
 *
 * 20 unidirectional pairs cover all client→upstream combinations.
 * Naming: pairs/{client}-{upstream}/ — left=client, right=upstream.
 */

import type { TransformResult, StreamConverter, TransformRequestOptions, TransformResponseOptions, StreamConverterOptions } from './types.js';
export type { Format, TransformResult, StreamConverter, SSEEvent, TransformRequestOptions, TransformResponseOptions, StreamConverterOptions, ReasoningConfig } from './types.js';

export { detectRequestFormat, sourceTypeToFormat } from './detector.js';
export { getReasoningConfig, applyReasoningConfig } from './thinking/providers.js';

// --- Compact API ---
export {
  extractConversationText,
  extractMessageContent,
  isClaudeCompactRequest,
  isLastClaudeMessageCompact,
  isCodexCompactRequest,
  COMPACTION_SYSTEM_PROMPT,
  buildCompactionPrompt,
  buildCompactUpstreamRequest,
  extractSummaryFromResponse,
  buildCompactedResponse,
  // Unified high-level API
  prepareCompactRequest,
  processCompactResponse,
} from './compact.js';
export type { CompactRequestOptions, CompactRequestResult } from './compact.js';

// --- claude client → * upstream ---
import { claudeToCompletions } from './pairs/claude-completions/request.js';
import { completionsResponseToClaude } from './pairs/claude-completions/response.js';
import { CompletionsToClaudeConverter } from './pairs/claude-completions/streaming.js';

import { claudeToResponses } from './pairs/claude-responses/request.js';
import { responsesToClaudeResponse } from './pairs/claude-responses/response.js';
import { ResponsesToClaudeConverter } from './pairs/claude-responses/streaming.js';

import { claudeToGemini } from './pairs/claude-gemini/request.js';
import { geminiToClaudeResponse } from './pairs/claude-gemini/response.js';
import { GeminiToClaudeConverter } from './pairs/claude-gemini/streaming.js';

import { claudeToDeepSeek } from './pairs/claude-deepseek/request.js';
import { deepseekToClaudeResponse } from './pairs/claude-deepseek/response.js';
import { DeepseekToClaudeConverter } from './pairs/claude-deepseek/streaming.js';

// --- completions client → * upstream ---
import { completionsToClaude } from './pairs/completions-claude/request.js';
import { claudeResponseToCompletions } from './pairs/completions-claude/response.js';
import { ClaudeToCompletionsConverter } from './pairs/completions-claude/streaming.js';

import { completionsToResponses } from './pairs/completions-responses/request.js';
import { responsesToCompletionsResponse } from './pairs/completions-responses/response.js';
import { ResponsesToCompletionsConverter } from './pairs/completions-responses/streaming.js';

import { completionsToGemini } from './pairs/completions-gemini/request.js';
import { geminiToCompletionsResponse } from './pairs/completions-gemini/response.js';
import { GeminiToCompletionsConverter } from './pairs/completions-gemini/streaming.js';

import { completionsToDeepseek } from './pairs/completions-deepseek/request.js';
import { deepseekToCompletionsResponse } from './pairs/completions-deepseek/response.js';
import { DeepseekToCompletionsConverter } from './pairs/completions-deepseek/streaming.js';

// --- responses client → * upstream ---
import { responsesToClaude } from './pairs/responses-claude/request.js';
import { claudeToResponsesResponse } from './pairs/responses-claude/response.js';
import { ClaudeToResponsesConverter } from './pairs/responses-claude/streaming.js';

import { responsesToCompletions } from './pairs/responses-completions/request.js';
import { completionsToResponsesResponse } from './pairs/responses-completions/response.js';
import { CompletionsToResponsesConverter } from './pairs/responses-completions/streaming.js';

import { responsesToGeminiRequest } from './pairs/responses-gemini/request.js';
import { geminiToResponsesResponse } from './pairs/responses-gemini/response.js';
import { GeminiToResponsesConverter } from './pairs/responses-gemini/streaming.js';

import { responsesToDeepseekRequest } from './pairs/responses-deepseek/request.js';
import { deepseekToResponsesResponse } from './pairs/responses-deepseek/response.js';
import { DeepseekToResponsesConverter } from './pairs/responses-deepseek/streaming.js';

// --- responses → responses (同格式降级兼容) ---
import { downgradeResponsesRequest } from './pairs/responses-responses/request.js';

// --- gemini client → * upstream ---
import { geminiToClaude } from './pairs/gemini-claude/request.js';
import { claudeToGeminiResponse } from './pairs/gemini-claude/response.js';
import { ClaudeToGeminiConverter } from './pairs/gemini-claude/streaming.js';

import { geminiToCompletions } from './pairs/gemini-completions/request.js';
import { completionsToGeminiResponse } from './pairs/gemini-completions/response.js';
import { CompletionsToGeminiConverter } from './pairs/gemini-completions/streaming.js';

import { geminiToResponsesRequest } from './pairs/gemini-responses/request.js';
import { responsesToGeminiResponse } from './pairs/gemini-responses/response.js';
import { ResponsesToGeminiConverter } from './pairs/gemini-responses/streaming.js';

import { geminiToDeepseek } from './pairs/gemini-deepseek/request.js';
import { deepseekToGeminiResponse } from './pairs/gemini-deepseek/response.js';
import { DeepseekToGeminiConverter } from './pairs/gemini-deepseek/streaming.js';

// --- deepseek client → * upstream ---
import { deepseekToClaude } from './pairs/deepseek-claude/request.js';
import { claudeToDeepSeekResponse } from './pairs/deepseek-claude/response.js';
import { ClaudeToDeepseekConverter } from './pairs/deepseek-claude/streaming.js';

import { deepseekToCompletions } from './pairs/deepseek-completions/request.js';
import { completionsToDeepseekResponse } from './pairs/deepseek-completions/response.js';
import { CompletionsToDeepseekConverter } from './pairs/deepseek-completions/streaming.js';

import { deepseekToResponsesRequest } from './pairs/deepseek-responses/request.js';
import { responsesToDeepseekResponse } from './pairs/deepseek-responses/response.js';
import { ResponsesToDeepseekConverter } from './pairs/deepseek-responses/streaming.js';

import { deepseekToGemini } from './pairs/deepseek-gemini/request.js';
import { geminiToDeepseekResponse } from './pairs/deepseek-gemini/response.js';
import { GeminiToDeepseekConverter } from './pairs/deepseek-gemini/streaming.js';

// ============================================================
// Public API: Request Transformation
// ============================================================

/**
 * Transform a request body from one format to another.
 */
export function transformRequest(options: TransformRequestOptions): TransformResult {
  const { fromFormat, toFormat, body, sanitizeBody } = options;

  const targetBody = buildTargetBody({ fromFormat, toFormat, body, sanitizeBody });

  return { body: targetBody, headers: {} };
}

// ============================================================
// Public API: Response Transformation
// ============================================================

/**
 * Transform a response body from upstream format back to client format.
 */
export function transformResponse(options: TransformResponseOptions): any {
  const { fromFormat, toFormat, response } = options;

  // Passthrough: same format
  if (fromFormat === toFormat) {
    return response;
  }

  const key = `${fromFormat}->${toFormat}`;

  switch (key) {
    // --- upstream claude → client * ---
    case 'claude->completions':
      return claudeResponseToCompletions(response);
    case 'claude->responses':
      return claudeToResponsesResponse(response);
    case 'claude->gemini':
      return claudeToGeminiResponse(response);
    case 'claude->deepseek':
      return claudeToDeepSeekResponse(response);

    // --- upstream responses → client * ---
    case 'responses->claude':
      return responsesToClaudeResponse(response);
    case 'responses->completions':
      return responsesToCompletionsResponse(response);
    case 'responses->gemini':
      return responsesToGeminiResponse(response);
    case 'responses->deepseek':
      return responsesToDeepseekResponse(response);

    // --- upstream completions → client * ---
    case 'completions->claude':
      return completionsResponseToClaude(response);
    case 'completions->responses':
      return completionsToResponsesResponse(response);
    case 'completions->gemini':
      return completionsToGeminiResponse(response);
    case 'completions->deepseek':
      return completionsToDeepseekResponse(response);

    // --- upstream gemini → client * ---
    case 'gemini->claude':
      return geminiToClaudeResponse(response);
    case 'gemini->completions':
      return geminiToCompletionsResponse(response);
    case 'gemini->responses':
      return geminiToResponsesResponse(response);
    case 'gemini->deepseek':
      return geminiToDeepseekResponse(response);

    // --- upstream deepseek → client * ---
    case 'deepseek->claude':
      return deepseekToClaudeResponse(response);
    case 'deepseek->completions':
      return deepseekToCompletionsResponse(response);
    case 'deepseek->responses':
      return deepseekToResponsesResponse(response);
    case 'deepseek->gemini':
      return deepseekToGeminiResponse(response);

    default:
      return response;
  }
}

// ============================================================
// Public API: Stream Converter Factory
// ============================================================

/**
 * Create a streaming converter for the given format pair.
 */
export function createStreamConverter(options: StreamConverterOptions): StreamConverter {
  const { fromFormat, toFormat } = options;

  // Passthrough: same format
  if (fromFormat === toFormat) {
    return new PassthroughConverter();
  }

  const key = `${fromFormat}->${toFormat}`;

  switch (key) {
    // --- upstream → claude client ---
    case 'completions->claude':
      return new CompletionsToClaudeConverter();
    case 'deepseek->claude':
      return new DeepseekToClaudeConverter();
    case 'gemini->claude':
      return new GeminiToClaudeConverter();
    case 'responses->claude':
      return new ResponsesToClaudeConverter();

    // --- upstream → responses client ---
    case 'completions->responses':
      return new CompletionsToResponsesConverter();
    case 'deepseek->responses':
      return new DeepseekToResponsesConverter();
    case 'gemini->responses':
      return new GeminiToResponsesConverter();
    case 'claude->responses':
      return new ClaudeToResponsesConverter();

    // --- upstream → completions client ---
    case 'claude->completions':
      return new ClaudeToCompletionsConverter();
    case 'deepseek->completions':
      return new DeepseekToCompletionsConverter();
    case 'gemini->completions':
      return new GeminiToCompletionsConverter();
    case 'responses->completions':
      return new ResponsesToCompletionsConverter();

    // --- upstream → gemini client ---
    case 'claude->gemini':
      return new ClaudeToGeminiConverter();
    case 'completions->gemini':
      return new CompletionsToGeminiConverter();
    case 'responses->gemini':
      return new ResponsesToGeminiConverter();
    case 'deepseek->gemini':
      return new DeepseekToGeminiConverter();

    // --- upstream → deepseek client ---
    case 'claude->deepseek':
      return new ClaudeToDeepseekConverter();
    case 'completions->deepseek':
      return new CompletionsToDeepseekConverter();
    case 'responses->deepseek':
      return new ResponsesToDeepseekConverter();
    case 'gemini->deepseek':
      return new GeminiToDeepseekConverter();

    default:
      return new PassthroughConverter();
  }
}

// ============================================================
// Helpers
// ============================================================


/**
 * Transform a request body from one format to another.
 */
export function buildTargetBody(options: Pick<TransformRequestOptions, 'fromFormat' | 'toFormat' | 'body' | 'sanitizeBody'>): any {
  const { fromFormat, toFormat, body, sanitizeBody } = options;

  // Dispatch to the correct conversion pair
  const key = `${fromFormat}->${toFormat}`;

  switch (key) {
    // --- claude → * ---
    case 'claude->completions':
      return claudeToCompletions(body);
    case 'claude->responses':
      return claudeToResponses(body);
    case 'claude->gemini':
      return claudeToGemini(body);
    case 'claude->deepseek': {
      return claudeToDeepSeek(body);
    }

    // --- responses → * ---
    case 'responses->completions':
      return responsesToCompletions(body);
    case 'responses->claude':
      return responsesToClaude(body);
    case 'responses->gemini':
      return responsesToGeminiRequest(body);
    case 'responses->deepseek':
      return responsesToDeepseekRequest(body);
    case 'responses->responses': {
      if (sanitizeBody) {
        // Responses 格式降级兼容：委托给 responses-responses pair 处理
        return downgradeResponsesRequest(body);
      }
      return body;
    }

    // --- completions → * ---
    case 'completions->claude':
      return completionsToClaude(body);
    case 'completions->responses':
      return completionsToResponses(body);
    case 'completions->gemini':
      return completionsToGemini(body);
    case 'completions->deepseek': {
      return completionsToDeepseek(body);
    }

    // --- gemini → * ---
    case 'gemini->claude':
      return geminiToClaude(body);
    case 'gemini->completions':
      return geminiToCompletions(body);
    case 'gemini->responses':
      return geminiToResponsesRequest(body);
    case 'gemini->deepseek': {
      return geminiToDeepseek(body);
    }

    // --- deepseek → * ---
    case 'deepseek->claude':
      return deepseekToClaude(body);
    case 'deepseek->completions':
      return deepseekToCompletions(body);
    case 'deepseek->responses':
      return deepseekToResponsesRequest(body);
    case 'deepseek->gemini':
      return deepseekToGemini(body);

    default:
      return body;
  }
}

/** Identity converter that passes events through unchanged */
class PassthroughConverter implements StreamConverter {
  convertEvent(event: import('./types.js').SSEEvent): import('./types.js').SSEEvent[] {
    return [event];
  }
  flush(): import('./types.js').SSEEvent[] {
    return [];
  }
}
