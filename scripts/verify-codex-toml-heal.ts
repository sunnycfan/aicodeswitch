/**
 * 验证 Codex config.toml 全部写入链路的数组自愈逻辑
 *
 * 背景：旧版 deepSet 曾把数组字段（如新版 Codex 的 notify）序列化成
 * `[notify] 0=.. 1=..` 数字键 table，导致 Codex 报
 * `invalid type: map, expected a sequence`。修复后 parseToml 在解析时
 * 把「键全为 0..n-1 连续整数」的对象还原为数组，任何一次写入自动修复文件。
 *
 * 本脚本用真实模块（上游 src/server + 客户端移植副本 client/src/switch）
 * 模拟全部 4 条写入链路，断言 notify 始终以数组形式写出：
 *   1. writeCodexConfig（启动接管 / 运行时刷新）：proxy 为基 + 当前非托管字段
 *   2. restoreCodexConfig（停止恢复 / aicos restore）：backup 为基 + 当前非托管字段
 *   3. writeMCPConfig（MCP 同步）：parse → 直接改 mcp_servers → stringify
 *   4. removeMCPConfig（MCP 移除）：parse → 删条目 → stringify
 *
 * 运行：npx tsx scripts/verify-codex-toml-heal.ts
 */
import { parseToml, mergeTomlConfig, stringifyToml } from '../src/server/config-merge';
import { CODEX_CONFIG_MANAGED_FIELDS } from '../src/server/config-managed-fields';
// 客户端移植副本（同一份逻辑的定制移植，见 client/src/switch/ADAPTATIONS.md）
import {
  parseToml as clientParseToml,
  mergeTomlConfig as clientMergeTomlConfig,
  stringifyToml as clientStringifyToml,
} from '../../../client/src/switch/server/config-merge';
import { CODEX_CONFIG_MANAGED_FIELDS as CLIENT_MANAGED_FIELDS } from '../../../client/src/switch/server/config-managed-fields';

// 场景素材 ---------------------------------------------------------------

/** 历史 bug 产生的坏结构：数组被写成数字键 table */
const CORRUPT_NOTIFY = `
[notify]
0 = "/Users/x/.codex/computer-use/Client.app/Contents/MacOS/Client"
1 = "turn-ended"
`;

/** 正常的数组字段（Codex 自己写入的；必须位于文件顶部——TOML 裸键属于上一个 table 头的上下文） */
const GOOD_NOTIFY = `notify = ["/Users/x/.codex/computer-use/Client.app/Contents/MacOS/Client", "turn-ended"]
`;

/** 含命名 table 的现场（确认自愈不误伤） */
const LIVE_SCENE = `
model_provider = "aicodeswitch"
model = "gpt-5.3-codex"

[model_providers.aicodeswitch]
name = "aicodeswitch"
base_url = "http://127.0.0.1:4567/codex"
wire_api = "responses"

[mcp_servers.node_repl]
command = "/Applications/Codex.app/Contents/Resources/node_repl"
args = [ "--a", "--b" ]

  [mcp_servers.node_repl.env]
  CODEX_HOME = "/Users/x/.codex"
`;

/** 接管时写入的代理配置（writeCodexConfig 的 source） */
const PROXY_CONFIG: Record<string, any> = {
  model_provider: 'aicodeswitch',
  model: 'gpt-5.3-codex',
  model_reasoning_effort: 'high',
  disable_response_storage: true,
  preferred_auth_method: 'apikey',
  requires_openai_auth: true,
  enableRouteSelection: true,
  model_providers: {
    aicodeswitch: {
      name: 'aicodeswitch',
      base_url: 'http://127.0.0.1:4567/codex',
      wire_api: 'responses',
    },
  },
};

// 断言工具 ---------------------------------------------------------------

let failed = 0;
const check = (name: string, ok: boolean, detail: string) => {
  if (!ok) failed += 1;
  console.log(`  ${ok ? '✓' : '✗ FAIL'} ${name}${ok ? '' : `\n      ${detail}`}`);
};

/** 从 stringify 输出中提取 notify 的 TOML 表达形态 */
const notifyForm = (output: string): string => {
  const inline = output.match(/^notify = \[/m);
  const table = output.match(/^\[notify\]/m);
  if (inline) return 'array';
  if (table) return 'corrupt-table';
  return 'absent';
};

// 按模块跑同一套链路 ------------------------------------------------------

interface Mod {
  label: string;
  parse: typeof parseToml;
  merge: typeof mergeTomlConfig;
  stringify: typeof stringifyToml;
  managed: typeof CODEX_CONFIG_MANAGED_FIELDS;
  /** 上游把 mcp_servers 列为托管字段（接管时丢弃、由 MCP 同步重写）；客户端副本定制为不托管（现场保留） */
  mcpManaged: boolean;
}

const runAll = (mod: Mod) => {
  console.log(`\n===== ${mod.label} =====`);

  // 链路 1：writeCodexConfig —— 现场（含坏结构）作为 other 合入代理配置
  {
    const live = mod.parse(LIVE_SCENE + CORRUPT_NOTIFY);
    const merged = mod.merge(
      JSON.parse(JSON.stringify(PROXY_CONFIG)),
      live,
      mod.managed
    );
    const out = mod.stringify(merged);
    check('1a. 接管写入：坏 notify → 数组', notifyForm(out) === 'array', out);
    if (mod.mcpManaged) {
      check(
        '1b. 接管写入：mcp_servers 为托管字段被丢弃（由 MCP 同步重写）',
        !/mcp_servers/.test(out),
        out
      );
    } else {
      check(
        '1b. 接管写入：mcp_servers 非托管字段保留',
        /\[mcp_servers\.node_repl\]/.test(out) && /CODEX_HOME/.test(out),
        out
      );
    }
  }

  // 链路 1 变体：现场已是正常数组 → 不得破坏
  {
    const live = mod.parse(GOOD_NOTIFY + LIVE_SCENE);
    const merged = mod.merge(JSON.parse(JSON.stringify(PROXY_CONFIG)), live, mod.managed);
    check('1c. 接管写入：正常数组保持数组', notifyForm(mod.stringify(merged)) === 'array', mod.stringify(merged));
  }

  // 链路 2：restoreCodexConfig —— backup（含坏结构）为基 + 当前非托管字段
  {
    const backup = mod.parse(LIVE_SCENE.replace('aicodeswitch', 'localhost') + CORRUPT_NOTIFY);
    const current = mod.parse(GOOD_NOTIFY + LIVE_SCENE);
    const merged = mod.merge(backup, current, mod.managed);
    const out = mod.stringify(merged);
    check('2a. 停止恢复：坏 backup 的 notify → 数组', notifyForm(out) === 'array', out);
  }

  // 链路 3：writeMCPConfig —— parse → 直接改 mcp_servers → stringify（不经过 merge）
  {
    const current = mod.parse(LIVE_SCENE + CORRUPT_NOTIFY);
    current.mcp_servers = current.mcp_servers || {};
    current.mcp_servers['new-mcp'] = { command: 'npx', args: ['-y', 'server'] };
    const out = mod.stringify(current);
    check('3a. MCP 同步：坏 notify → 数组', notifyForm(out) === 'array', out);
    check('3b. MCP 同步：新 MCP 条目写入', /\[mcp_servers\.new-mcp\]/.test(out), out);
    check(
      '3c. MCP 同步：既有 args 数组仍为数组',
      /args = \[/.test(out),
      out
    );
  }

  // 链路 4：removeMCPConfig —— parse → 删条目 → stringify
  {
    const current = mod.parse(LIVE_SCENE + CORRUPT_NOTIFY);
    delete current.mcp_servers['node_repl'];
    const out = mod.stringify(current);
    check('4a. MCP 移除：坏 notify → 数组', notifyForm(out) === 'array', out);
    check('4b. MCP 移除：条目已删除', !/node_repl/.test(out), out);
  }

  // 兜底：自愈不误伤「用户手写的非 0 起始数字键」与普通 table
  {
    const parsed = mod.parse('[user_table]\n1 = "a"\n2 = "b"\n');
    const out = mod.stringify(parsed);
    check('5a. 非 0 起始数字键保持 table', /\[user_table\]/.test(out) && /1 = "a"/.test(out), out);
  }
};

runAll({
  label: '上游 src/server（CLI/Web/Electron 共用）',
  parse: parseToml,
  merge: mergeTomlConfig,
  stringify: stringifyToml,
  managed: CODEX_CONFIG_MANAGED_FIELDS,
  mcpManaged: true,
});

runAll({
  label: '客户端移植副本 client/src/switch',
  parse: clientParseToml,
  merge: clientMergeTomlConfig,
  stringify: clientStringifyToml,
  managed: CLIENT_MANAGED_FIELDS,
  mcpManaged: false,
});

console.log(failed === 0 ? '\n全部通过 ✓' : `\n${failed} 项失败 ✗`);
process.exit(failed === 0 ? 0 : 1);
