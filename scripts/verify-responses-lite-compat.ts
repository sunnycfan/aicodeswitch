/**
 * 验证 Codex Responses Lite 协议兼容修复
 *
 * 背景：新版 Codex（GPT-5.6 起）请求携带 x-openai-internal-codex-responses-lite 头，
 * 协议要求请求体 parallel_tool_calls=false。代理转发该头部，但 responses→responses
 * 降级清理（sanitizeBody，火山方舟等第三方兼容）会剥离顶层 parallel_tool_calls，
 * 上游校验报 "X-OpenAI-Internal-Codex-Responses-Lite requires parallel_tool_calls to be false"。
 *
 * 修复：proxy-server 在两条转发路径的最终请求体上调用 applyResponsesLiteCompat——
 * 检测到 lite 头且目标为 Responses 格式时补回 parallel_tool_calls=false。
 *
 * 本脚本用真实模块复现「剥离 → 补回」全链路：
 *   1. 复现 bug：downgradeResponsesRequest 剥离 parallel_tool_calls
 *   2. 修复生效：applyResponsesLiteCompat 补回 false
 *   3. 门控正确：无 lite 头 / 非 Responses 目标 / 已是 false 时不改写
 *
 * 运行：npx tsx scripts/verify-responses-lite-compat.ts
 */
import { ProxyServer } from '../src/server/proxy-server';
// 代理实际调用的转换管线 API（transformRequestToUpstream → transformRequest）
import { transformRequest as convertRequest } from 'aitoken-conversions';

/** 复现代理 transformRequestToUpstream 的 responses→responses 降级路径（sanitizeBody=true） */
const downgrade = (body: any) =>
  convertRequest({ fromFormat: 'responses', toFormat: 'responses', body, sanitizeBody: true }).body;

let failed = 0;
const check = (name: string, ok: boolean, detail: string) => {
  if (!ok) failed += 1;
  console.log(`  ${ok ? '✓' : '✗ FAIL'} ${name}${ok ? '' : `\n      ${detail}`}`);
};

// applyResponsesLiteCompat 不依赖 this，可脱离实例调用
const applyLiteCompat = (headers: Record<string, any>, body: any, targetIsResponses: boolean) =>
  (ProxyServer.prototype as any).applyResponsesLiteCompat.call(null, { headers }, body, targetIsResponses);

// Codex Lite 模式的典型请求体（parallel_tool_calls=false 为协议要求）
const liteBody = (): any => ({
  model: 'gpt-5.6',
  stream: true,
  instructions: 'You are Codex.',
  input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
  tools: [{ type: 'function', name: 'shell', parameters: {} }],
  parallel_tool_calls: false,
  reasoning: { effort: 'high' },
});

console.log('===== 1. 复现根因：降级清理剥离 parallel_tool_calls =====');
{
  const body = liteBody();
  const sanitized = downgrade(body);
  check(
    'sanitizeBody 剥离后 parallel_tool_calls 消失（即上游报错的直接原因）',
    !('parallel_tool_calls' in sanitized),
    JSON.stringify(sanitized)
  );
}

console.log('\n===== 2. 修复生效：lite 头 + Responses 目标 → 补回 false =====');
{
  // 完整链路：lite 请求 → 降级清理（剥离）→ applyResponsesLiteCompat（补回）
  const sanitized = downgrade(liteBody());
  const headers = { 'x-openai-internal-codex-responses-lite': 'true' };
  const fixed = applyLiteCompat(headers, sanitized, true);
  check(
    '降级清理后补回 parallel_tool_calls=false',
    fixed.parallel_tool_calls === false,
    JSON.stringify(fixed)
  );

  // 未经过降级清理（官方 OpenAI，sanitizeBody=false）：Codex 自带的 false 保持不变
  const untouched = applyLiteCompat(headers, liteBody(), true);
  check('已是 false 时不重复改写', untouched.parallel_tool_calls === false, JSON.stringify(untouched));

  // Codex 版本异常发送 true 的兜底：强制回 false
  const abnormal = applyLiteCompat(headers, { ...liteBody(), parallel_tool_calls: true }, true);
  check('异常 true 被纠正为 false', abnormal.parallel_tool_calls === false, JSON.stringify(abnormal));
}

console.log('\n===== 3. 门控：不影响其他场景 =====');
{
  const headers = { 'x-openai-internal-codex-responses-lite': 'true' };

  // 无 lite 头：即便 Responses 目标也不注入
  const noHeader = applyLiteCompat({}, { model: 'x' }, true);
  check('无 lite 头不注入', !('parallel_tool_calls' in noHeader), JSON.stringify(noHeader));

  // lite 头但目标非 Responses（如 Claude 上游）：不注入未知字段
  const claudeTarget = applyLiteCompat(headers, { model: 'claude-5', messages: [] }, false);
  check('非 Responses 目标不注入（避免 Claude 上游 unknown field）', !('parallel_tool_calls' in claudeTarget), JSON.stringify(claudeTarget));

  // 非 object 请求体：原样返回
  check('非对象请求体原样返回', applyLiteCompat(headers, null, true) === null, 'null');

  // 头部值解析：任意非空字符串均视为启用（Node 头已小写）
  const arrHeader = applyLiteCompat({ 'x-openai-internal-codex-responses-lite': '1' }, { model: 'x' }, true);
  check('任意非空头值生效', arrHeader.parallel_tool_calls === false, JSON.stringify(arrHeader));
}

console.log(failed === 0 ? '\n全部通过 ✓' : `\n${failed} 项失败 ✗`);
process.exit(failed === 0 ? 0 : 1);
