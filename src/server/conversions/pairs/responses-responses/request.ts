/**
 * Responses → Responses 同格式降级兼容转换。
 *
 * 当 Codex 等客户端向非 OpenAI 的第三方 Responses API 提供商（如火山方舟/豆包）发送请求时，
 * 需要清理 OpenAI 私有扩展、转换消息格式，以确保兼容性。
 */

/**
 * 第三方 Responses API 提供商仅支持 function 类型工具。
 * OpenAI 私有扩展（apply_patch 的 custom、MCP 的 namespace、
 * tool_search、web_search、file_search、code_interpreter 等）一律剥离，
 * 直接转发会导致 400 `unknown tool type` 错误。
 * 采用 function 白名单而非黑名单，避免新增私有类型时遗漏。
 */

/**
 * Responses API 降级兼容时需移除的顶层字段集合。
 * 这些字段非所有 Responses API 提供商都支持，开启降级兼容时会被移除以避免 400 错误。
 * - reasoning: { effort } — OpenAI 推理努力程度控制（火山方舟不支持）
 * - text: { verbosity } — OpenAI 响应 verbosity 控制（火山方舟用 text.format 做结构化输出）
 * - prompt_cache_key — OpenAI 提示缓存键
 * - client_metadata — OpenAI 客户端元数据
 * - include — OpenAI 响应包含项（如 reasoning.encrypted_content）
 * - parallel_tool_calls — OpenAI 并行工具调用控制（火山方舟未明确支持）
 */
const DOWNGRADE_STRIP_FIELDS = new Set([
  'reasoning', 'text', 'prompt_cache_key', 'client_metadata',
  'include', 'parallel_tool_calls',
]);

/**
 * 将 input message 的 content 规范化为 ContentItem 数组。
 * 火山方舟等第三方 Responses API 提供商要求 content 为 []*responses.ContentItem 数组格式，
 * 不接受纯字符串。因此需要确保 content 始终为数组：
 * - 字符串 → [{type: "input_text"/"output_text", text: "..."}]（根据 role 选择类型）
 * - 数组 → 保持不变
 */
function normalizeInputContent(content: any, role?: string): any {
  // 已经是数组，保持不变
  if (Array.isArray(content)) return content;
  // 字符串：根据 role 转为对应的 ContentItem 数组
  if (typeof content === 'string') {
    const type = role === 'assistant' ? 'output_text' : 'input_text';
    return [{ type, text: content }];
  }
  return content;
}

/**
 * 对 Responses API 请求体执行降级兼容转换。
 *
 * 处理项：
 * 1. 过滤非标准 tool 类型（custom/tool_search/web_search 等），仅保留 function
 * 2. 移除非标准顶层字段（reasoning/text/include/parallel_tool_calls 等）
 * 3. 转换 input 消息格式：
 *    - role: "developer" → role: "system"
 *    - content 字符串 → content: [{type:"input_text"/"output_text", text:"..."}]
 *    - 补全 status: "completed"
 */
export function downgradeResponsesRequest(body: any): any {
  if (!body || typeof body !== 'object') return body;

  let sanitized = body;
  const ensureCopy = () => {
    if (sanitized === body) sanitized = { ...sanitized };
    return sanitized;
  };

  // 1. 仅保留 function 类型工具，剥离 custom/namespace/tool_search/web_search 等私有类型
  if (Array.isArray(body.tools)) {
    const filteredTools = body.tools.filter((t: any) => t && t.type === 'function');
    if (filteredTools.length !== body.tools.length) {
      sanitized = { ...sanitized, tools: filteredTools };
    }
  }

  // 2. 移除非标准顶层字段
  for (const field of DOWNGRADE_STRIP_FIELDS) {
    if (field in sanitized) {
      ensureCopy();
      delete sanitized[field];
    }
  }

  // 3. 转换 input 消息格式
  if (Array.isArray(sanitized.input)) {
    let patched = false;
    const patchedInput = sanitized.input.map((item: any) => {
      if (!item || typeof item !== 'object') return item;

      let modified = { ...item };

      // 3a. developer → system
      if (modified.role === 'developer') {
        modified.role = 'system';
        patched = true;
      }

      // 3b. 规范化 content 为 ContentItem 数组
      const normalized = normalizeInputContent(modified.content, modified.role);
      if (normalized !== modified.content) {
        modified.content = normalized;
        patched = true;
      }

      // 3c. 补全 status 字段
      if (modified.type === 'message' && !('status' in modified)) {
        modified.status = 'completed';
        patched = true;
      }

      return modified;
    });
    if (patched) {
      ensureCopy();
      sanitized.input = patchedInput;
    }
  }

  return sanitized;
}
