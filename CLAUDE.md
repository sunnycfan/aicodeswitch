```
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
```

## Project Overview

This project named AICodeSwitch is a local proxy server that manages AI programming tool connections to large language models, allowing tools like Claude Code and Codex to use custom model APIs instead of official ones.

## Development Commands

### Installation
```bash
npm install
```

### Development
```bash
npm run dev              # Run both UI and server in watch mode
npm run dev:ui           # Run only React UI (Vite dev server)
npm run dev:server       # Run only Node.js server (TSX watch)
```

### Build
```bash
npm run build            # Build both UI and server
npm run build:ui         # Build React UI to dist/ui
npm run build:server     # Build TypeScript server to dist/server
```

### Tauri Desktop Application
```bash
npm run tauri:dev        # Run Tauri development mode (requires Rust toolchain)
npm run tauri:build      # Build Tauri desktop application
npm run tauri:icon       # Generate application icons from source image
```

**Prerequisites for Tauri build:**
- Rust toolchain (rustc, cargo) - Install from https://rustup.rs/
- Windows: Microsoft Visual Studio C++ Build Tools
- macOS: Xcode Command Line Tools

### Linting
```bash
npm run lint             # Run ESLint on all .ts/.tsx files
```

### CLI Commands
```bash
npm link                 # Link local package for CLI testing
aicos start              # Start the proxy server
aicos stop               # Stop the proxy server
aicos restart            # Restart the proxy server
aicos ui                 # Open web UI in browser (starts server if needed)
aicos upgrade            # Upgrade to the latest version and restart
aicos restore            # Restore original configuration files
aicos version            # Show current version information
```

## Architecture

### High-Level Structure

#### Traditional Deployment (CLI/Web)
```
┌─────────────────────────────────────────────────────────────┐
│                     AICodeSwitch                          │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   React UI   │  │  Express API │  │  Proxy Core  │     │
│  │  (Vite dev)  │  │  (Node.js)   │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│            │              │              │                  │
│            └──────────────┼──────────────┘                  │
│                           ▼                                 │
│                    ┌──────────────┐                        │
│                    │   Database   │                        │
│                    │  (JSON Files) │                        │
│                    │  FS Storage  │                        │
│                    └──────────────┘                        │
│                           │                                 │
│                           ▼                                 │
│                    ┌──────────────┐                        │
│                    │  Transformers │                        │
│                    │  (Stream/SSE) │                        │
│                    └──────────────┘                        │
│                           │                                 │
│                           ▼                                 │
│                    ┌──────────────┐                        │
│                    │  Upstream    │                        │
│                    │  APIs (LLMs) │                        │
│                    └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

#### Tauri Desktop Application (Hybrid Architecture)
```
┌─────────────────────────────────────────────────────────────┐
│              Tauri Desktop Application                      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Tauri Main Process (Rust)                           │  │
│  │  - Window Management                                 │  │
│  │  - Node.js Installation Check                        │  │
│  │  - Node.js Process Lifecycle Management              │  │
│  │  - System Integration                                │  │
│  └──────────────────────────────────────────────────────┘  │
│            │                           │                    │
│            ▼                           ▼                    │
│  ┌──────────────────┐      ┌──────────────────┐           │
│  │  WebView (React) │      │  Node.js Backend │           │
│  │  - UI Components │◄─────┤  - Express Server│           │
│  │  - User Interface│ HTTP │  - Proxy Logic   │           │
│  └──────────────────┘      │  - Database      │           │
│                             └──────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

**Tauri Hybrid Approach Benefits:**
- **Preserves Existing Code**: Node.js backend remains unchanged
- **Smaller App Size**: ~10-20MB (vs 150MB+ for Electron)
- **Better Performance**: Native system integration via Rust
- **Cross-Platform**: Windows, macOS, Linux support
- **No Rewrite Required**: Gradual migration path available

### Core Components

#### 1. Server (Node.js/Express) - `server/main.ts`
- Main entry point
- Configures Express with CORS, body parsing
- Reads configuration from `~/.aicodeswitch/aicodeswitch.conf`
- Sets up authentication middleware
- Registers all API routes
- Initializes database using `DatabaseFactory.createAuto()` which creates file system database
- Initializes proxy server

#### 2. Proxy Server - `server/proxy-server.ts`
- **Route Matching**: Finds active route based on target type (claude-code/codex)
- **Rule Matching**: Determines content type from request (image-understanding/thinking/long-context/background/default/compact)
- **Request Transformation**: Converts between different API formats (Claude ↔ OpenAI Chat)
- **Streaming**: Handles SSE (Server-Sent Events) streaming responses with real-time transformation
- **Claude Code Compact Guardrails**: Compact requests sanitize dangling tool history and strip `thinking`/`tools` capabilities before upstream forwarding; compact responses are reduced to plain text before being returned downstream
- **Logging**: Tracks requests, responses, and errors

#### 3. Transformers - `server/transformers/`
- **streaming.ts**: SSE parsing/serialization and event transformation
  - OpenAI ↔ Claude event transformation
  - Gemini ↔ Claude/OpenAI event transformation (streaming)
- **claude-openai.ts**: Claude ↔ OpenAI Chat format conversion
  - Image content block conversion (Claude ↔ OpenAI formats)
  - Tool choice mapping (auto/any/tool ↔ auto/none/required)
  - Stop reason mapping (including max_thinking_length)
  - System prompt handling (string and array formats)
  - Thinking/Reasoning content conversion
- **gemini.ts**: Gemini ↔ Claude/OpenAI Chat format conversion
  - Claude Messages API ↔ Gemini GenerateContent API
  - OpenAI Chat Completions API ↔ Gemini GenerateContent API
  - Image content block conversion (Claude/OpenAI ↔ Gemini inlineData)
  - Tool calls conversion (tool_use/tool_calls ↔ functionCall)
  - System instruction handling (system ↔ systemInstruction)
  - Thinking configuration conversion (thinking ↔ thinkingConfig)
  - Finish reason mapping (STOP/MAX_TOKENS/SAFETY ↔ end_turn/max_tokens/content_filter)
- **chunk-collector.ts**: Collects streaming chunks for logging

#### 4. MCP Image Handler - `server/mcp-image-handler.ts`
- **Purpose**: Handle image-understanding requests using MCP tools
- **Key Features**:
  - Extracts images from request messages (supports both Claude and OpenAI formats)
  - Saves images to temporary files (`/tmp/aicodeswitch-images/`)
  - Constructs MCP-compatible messages with local file path references
  - Automatically cleans up temporary files after request completion
- **Functions**:
  - `extractImagesFromMessages()`: Extracts all images from message array
  - `saveImageToTempFile()`: Saves base64 encoded images to temporary files
  - `constructMCPMessages()`: Replaces image content blocks with local file path references
  - `cleanupTempImages()`: Removes temporary image files
  - `isRuleUsingMCP()`: Checks if a rule is configured to use MCP for image understanding

**API 转换功能**：
转换器实现了以下 API 格式之间的双向转换：
- **Claude Messages API** ↔ **OpenAI Chat Completions API**
- **Claude Messages API** ↔ **OpenAI Responses API**
- **Claude Messages API** ↔ **Gemini GenerateContent API**
- **OpenAI Chat Completions API** ↔ **Gemini GenerateContent API**
- **OpenAI Chat Completions API** ↔ **OpenAI Responses API**
- **OpenAI Responses API** ↔ **Gemini GenerateContent API**

**Provider-driven 后处理**：`thinking/providers.ts` 通过 `getReasoningConfig()` 检测上游提供商（DeepSeek、Moonshot、Qwen 等），在 `buildTargetBody` 中自动注入 thinking 参数、修复 reasoning 历史消息、剥离 `stream_options` 等 provider 级别的后处理。

**支持的转换内容**：
- 文本内容 (text)
- 图像内容 (image ↔ image_url)
- 工具调用 (tool_use ↔ tool_calls)
- 工具结果 (tool_result)
- 思考内容 (thinking ↔ reasoning/thinking)
- 系统提示词 (system - 支持字符串和数组格式)

#### 5. Database - `server/fs-database.ts`
- **FileSystemDatabaseManager**: Pure JSON file-based storage (no database dependencies)
- **DatabaseFactory** (`server/database-factory.ts`): Creates file system database instances
- **Data Files**: Stores data as JSON in `~/.aicodeswitch/data/`:
  - `vendors.json` - AI service vendors with nested API services
  - `routes.json` - Route definitions
  - `rules.json` - Routing rules
  - `config.json` - Application configuration
  - `sessions.json` - User sessions
  - `logs.json` - Request logs
  - `error-logs.json` - Error logs
  - `blacklist.json` - Service blacklist entries
  - `mcps.json` - MCP (Model Context Protocol) tools

**Data Structure**:
- Vendors contain nested services array: `vendors[{ id, name, services: [{ id, name, apiUrl, ... }], ... }]`
- Services are no longer stored in a separate file, they are embedded within their parent vendor
- This structure ensures data consistency and simplifies cascade operations

#### 6. UI (React) - `ui/`
- Main app: `App.tsx` - Navigation and layout with collapsible sidebar
- Components:
  - `Tooltip.tsx` - Tooltip component for displaying menu text when sidebar is collapsed
  - `Toast.tsx` - Toast notification component
  - `Confirm.tsx` - Confirmation dialog component
  - `ToolsInstallModal.tsx` - Tools installation modal
  - `NotificationBar.tsx` - Notification bar component
- Pages:
  - `VendorsPage.tsx` - Manage AI service vendors
  - `SkillsPage.tsx` - Manage global Skills and discovery
  - `MCPPage.tsx` - Manage MCP (Model Context Protocol) tools
  - `RoutesPage.tsx` - Configure routing rules
  - `LogsPage.tsx` - View request/access/error logs
  - `SettingsPage.tsx` - Application settings
  - `WriteConfigPage.tsx` - Overwrite Claude Code/Codex config files
  - `UsagePage.tsx` - Usage statistics
- Styles:
  - `App.css` - Main application styles with sidebar collapse animations
  - `Tooltip.css` - Tooltip component styles

#### 7. CLI - `bin/`
- `cli.js` - Main CLI entry point
- `start.js` - Server startup with PID management
- `stop.js` - Server shutdown
- `restart.js` - Restart server

#### 8. Types - `types/`
- TypeScript type definitions for:
  - Database models (Vendors, Services, Routes, Rules)
  - API requests/responses
  - Configuration
  - Token usage tracking
  - **SourceType**: API 服务的数据格式类型（'openai-chat', 'openai', 'claude-chat', 'claude', 等）
  - **TargetType**: 路由目标类型（'claude-code', 'codex'）

#### 9. Tauri Desktop Application - `tauri/`
- **src/main.rs**: Tauri main process (Rust)
  - Node.js process lifecycle management
  - Server startup/shutdown commands
  - Health check and status monitoring
  - System integration (window management, tray icon)
- **Cargo.toml**: Rust dependencies and build configuration
- **tauri.conf.json**: Tauri application configuration
  - Window settings (size, title, decorations)
  - Bundle configuration (icons, resources)
  - Security policies (CSP, asset protocol)
  - Build commands and paths
- **icons/**: Application icon resources
  - Multiple formats for different platforms (PNG, ICO, ICNS)
  - Generated via `npm run tauri:icon`

## Key Features

### Routing System
- **Routes**: Define target type (Claude Code or Codex) and activation status
- **Rules**: Match requests by content type and route to specific API services
- **Route Configuration Options**:
  - **Agent Teams (Claude Code only)**: Enables experimental Agent Teams feature
    - Sets `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` environment variable
    - Requires Claude Code version ≥ 2.1.32
    - Can be toggled on/off for both active and inactive routes
  - **Bypass Permissions Support (Claude Code only)**: Enables support for bypassPermissions mode
    - Sets `permissions.defaultMode` to `"bypassPermissions"` in `~/.claude/settings.json`
    - Sets `skipDangerousModePermissionPrompt` to `true` in `~/.claude/settings.json`
    - Can be toggled on/off for both active and inactive routes
  - **Effort Level (Claude Code only)**: Controls the effort level for Claude Code
    - Options: `low`, `medium`, `high` (default: `medium`)
    - Sets `effortLevel` in `~/.claude/settings.json`
  - **Autocompact PCT Override (Claude Code only)**: Controls auto-compaction percentage threshold
    - Value range: 1-100 (integer)
    - Sets `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` as string in `~/.claude/settings.json`
    - Leave empty to not write this field
  - **Compact Routing Note (Claude Code only)**: compact summaries are forwarded as plain-text-only requests
    - Proxy sanitizes unmatched `tool_use/server_tool_use` history before forwarding
    - Proxy removes `thinking`, `tools`, `tool_choice`, and `mcp_servers` from compact upstream requests
    - Proxy filters `thinking` / `tool_use` blocks from compact responses before sending them back to Claude Code
  - **Reasoning Effort (Codex only)**: Controls the reasoning effort level
    - Options: `low`, `medium`, `high`, `xhigh` (default: `high`)
    - Sets `model_reasoning_effort` in `~/.codex/config.toml`
- **Fallback Mechanism**:
  - When no route is activated, system automatically falls back to original config files
  - Claude Code: Reads `~/.claude/settings.json` (prefers backup file if exists)
  - Codex: Reads `~/.codex/config.toml` and `auth.json` (prefers backup files if exist)
  - Ensures tools continue working even without active routes
  - Logs include tags: `未通过中转` + `使用原始配置` when fallback is used
  - **Dead Loop Prevention**: Automatically detects if original config points to local proxy and rejects to avoid infinite loops

- **Content Type Detection**:
  - `high-iq`: High intelligence mode (persistent across conversation)
    - Only checks for `[!]`/`[x]` prefixes when a high-iq rule exists for the route
    - Use `[!]` prefix to enable: "[!] 重构A模块"
    - Use `[x]` prefix to explicitly cancel: "[x] 返回普通模式"
    - Searches backwards from the end of the message list for `[!]` or `[x]`
    - Regular messages (no prefix) are skipped during search; the most recent `[!]` or `[x]` determines the mode
    - `[x]` takes priority over `[!]` (cancels high-IQ even if earlier `[!]` exists)
    - Once enabled, the entire conversation uses the high-IQ model
    - State persists in session until explicitly cancelled with `[x]` or rule becomes unavailable
    - Automatically detects rule availability and gracefully degrades when rule is unavailable
  - `image-understanding`: Requests with image content
    - 支持使用 MCP 工具处理图像理解请求
    - 开启 MCP 后，图片会被提取并保存到临时文件
    - 请求消息中的图片引用会被替换为本地文件路径
    - MCP 工具会自动识别并处理本地图片
  - `thinking`: Requests with reasoning/thinking signals
  - `long-context`: Requests with large context
    - 触发条件（满足任一）：
      1. Session 累积 tokens 超过阈值（默认 1M tokens，可配置）
      2. 请求体显式标记：`long_context: true` 或 `longContext: true`
      3. `max_tokens` ≥ 8000
      4. 请求内容长度 ≥ 12000 字符
    - 新增 `sessionTokenThreshold` 字段（单位：k），用于配置 session 累积 tokens 阈值
    - 当 session 累积 tokens 超过阈值后，该 session 的所有新请求都会走长上下文规则
  - `background`: Background/priority requests, including `/count_tokens` endpoint requests and token counting requests with `{"role": "user", "content": "count"}`
  - `default`: All other requests

### Request Transformation
- Supports multiple source types:
  - OpenAI Chat
  - OpenAI Code
  - OpenAI Responses
  - Claude Chat
  - Claude Code
- Model override helper now keeps original payload when no override model is provided (prevents fallback request-body null regression)
- Claude Code -> Gemini/Gemini Chat/OpenAI Chat/OpenAI defaults to streaming (SSE) when `stream` is not explicitly set to `false`
- `/v1/messages/count_tokens` is handled locally in server for Claude Code bridge sources, and returns `{ "input_tokens": number }` directly

### Configuration Management
- OpenAI `sourceType=openai` service `apiUrl` is no longer normalized or validated against a `/v1` suffix; preserve user input as-is
- **服务进程生命周期自动写入/恢复配置文件**：
  - 服务启动时自动写入 Claude Code 和 Codex 配置文件（不依赖激活路由）
    - 适用入口：`aicos start` / `aicos ui` / `aicos restart` / `yarn dev:server`
  - 服务终止前自动恢复原始配置文件
    - 适用入口：`aicos stop`（SIGTERM）/ 开发态 `Ctrl+C`（SIGINT）
  - `aicos restore` 保留为手动恢复命令
- **路由激活/停用**：不再自动写入/恢复配置文件
  - `/api/routes/:id/activate` - 不调用配置写入
  - `/api/routes/:id/deactivate` - 不调用配置恢复
  - `/api/routes/deactivate-all` - 仅停用路由，不调用配置恢复（配置恢复由服务终止信号统一触发）
- **配置修改 API**：保留现有的修改 API
  - `/api/write-config/claude` - 手动写入 Claude Code 配置
  - `/api/write-config/codex` - 手动写入 Codex 配置
  - `/api/update-claude-agent-teams` - 更新全局 Agent Teams 配置（兼容旧调用）
  - `/api/update-claude-bypass-permissions-support` - 更新全局 bypassPermissions 支持配置（兼容旧调用）
  - `/api/update-codex-reasoning-effort` - 更新全局 Codex Reasoning Effort（兼容旧调用）
- Exports/ imports encrypted configuration data

**配置文件**：
- Claude Code: `~/.claude/settings.json`, `~/.claude.json`
- Codex: `~/.codex/config.toml`, `~/.codex/auth.json`
- 备份文件：`*.aicodeswitch_backup`

#### 智能配置合并

系统使用“管理字段 + 保留字段”的智能合并策略，核心目标是：
- 代理接管期间稳定覆盖必要字段
- 恢复时尽量保留工具运行期新增的非托管内容
- 避免重复覆盖、备份污染和状态错乱

**一、服务启动：备份与覆盖写入（生命周期入口）**
- 触发入口：
  - `aicos start` / `aicos ui` / `aicos restart`
  - `yarn dev:server`
- 执行流程（`syncConfigsOnServerStartup`）：
  - 直接读取全局配置：`AppConfig.enableAgentTeams` / `AppConfig.enableBypassPermissionsSupport` / `AppConfig.codexModelReasoningEffort`
  - 调用 `writeClaudeConfig` / `writeCodexConfig`
- 写入保护：
  - 通过 `checkClaudeConfigStatus` / `checkCodexConfigStatus` 检测是否已是代理覆盖态
  - 若 `isOverwritten=true`，拒绝重复覆盖（返回 `false`）
- 备份策略：
  - 仅当对应 `*.aicodeswitch_backup` 不存在时备份原文件
  - backup 已存在时不覆盖旧备份，避免原始配置丢失
- 覆盖策略（智能合并）：
  - 代理配置仅写入管理字段
  - 当前文件中的非管理字段会被保留
  - 使用原子写入，降低中断损坏风险
- 元数据：
  - 写入后记录 metadata（hash / proxy marker / 文件路径）用于状态识别

**二、服务停止：恢复原始配置（生命周期出口）**
- 触发入口：
  - `aicos stop`（SIGTERM）
  - 开发态 `Ctrl+C`（SIGINT）
  - Tauri 生产模式关闭窗口后的服务终止流程
- 恢复流程（`restoreClaudeConfig` / `restoreCodexConfig`）：
  - 若 backup 存在：
    - 读取 backup（恢复基线）
    - 读取当前配置（可能包含工具运行时新增内容）
    - 以 backup 为基础，合并当前配置的非管理字段
    - 原子写回后删除 backup
  - 删除 metadata（`deleteMetadata`）
- 若 backup 不存在：
  - 视为 no-op，直接返回成功
- 异常场景：
  - 如被强制 `SIGKILL`，可能来不及恢复，可通过 `aicos restore` 手动修复

**三、UI 修改工具配置时的处理逻辑**
- 路由页（`RoutesPage`）：
  - `enableAgentTeams` / `enableBypassPermissionsSupport` / `codexModelReasoningEffort`
  - 当前写入全局配置（`config.json`），不直接写用户配置文件
  - 这些设置在“下次服务启动”时写入并生效（同时需重启对应编程工具）
- 兼容接口保留：
  - `/api/update-claude-agent-teams`
  - `/api/update-claude-bypass-permissions-support`
  - `/api/update-codex-reasoning-effort`
  - 这三个接口现在更新全局配置，不再直接改写工具配置文件
- 手动入口保留：
  - `/api/write-config/*`、`/api/restore-config/*`
  - UI 中的 `/write-config` 页面可用于调试/运维手动覆盖或恢复

**全局配置迁移（兼容旧版本）**
- 服务启动初始化时会尝试把历史“路由级工具配置”迁移到全局配置（仅在全局字段尚不存在时）
  - `Route.enableAgentTeams` -> `AppConfig.enableAgentTeams`
  - `Route.enableBypassPermissionsSupport` -> `AppConfig.enableBypassPermissionsSupport`
  - `Route.codexModelReasoningEffort` -> `AppConfig.codexModelReasoningEffort`
- 迁移后会清理路由对象中的旧字段，避免后续歧义

**四、`aicos restore` 命令处理逻辑**
- 调用方式：
  - `aicos restore`（恢复全部）
  - `aicos restore claude-code`
  - `aicos restore codex`
- 恢复行为：
  - 与服务退出使用同一套“智能恢复”策略（backup 基线 + 当前非管理字段）
  - 恢复后删除 backup 文件，防止陈旧备份反复覆盖
- 附加行为：
  - 命令结束前会停用所有激活路由（直接更新 routes 数据文件）
  - 输出“重启服务/工具”提示

**五、管理字段定义（托管字段）**
- Claude Code `settings.json`：
  - `env.ANTHROPIC_AUTH_TOKEN`
  - `env.ANTHROPIC_BASE_URL`
  - `env.API_TIMEOUT_MS`
  - `env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`
  - `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`（可选）
  - `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`（可选）
  - `permissions.defaultMode`（可选）
  - `skipDangerousModePermissionPrompt`（可选）
  - `effortLevel`（可选）
- Claude Code `.claude.json`：
  - `hasCompletedOnboarding`
  - `mcpServers`（可选）
- Codex `config.toml`：
  - `model_provider`
  - `model`
  - `model_reasoning_effort`
  - `disable_response_storage`
  - `preferred_auth_method`
  - `requires_openai_auth`
  - `enableRouteSelection`
  - `[model_providers.aicodeswitch]` 整个 section
- Codex `auth.json`：
  - `OPENAI_API_KEY`
- 保留字段：
  - 以上以外的全部字段（如 Claude 的 `projects`、Codex 的 `[projects...]`）

**六、其他关联逻辑**
- 状态检测：
  - `check*ConfigStatus` 返回 `isOverwritten / isModified / hasBackup`
  - 综合 proxy marker、hash、backup 与 metadata 判断状态
- 无效 metadata 清理：
  - `cleanupInvalidMetadata` 会清理“metadata 存在但 backup 丢失”的异常状态
- 合并实现细节：
  - 合并器按“叶子路径”复制非管理字段，避免父级对象整块复制导致管理字段被反向覆盖
- 原始配置读取兜底：
  - `original-config-reader` 优先读取 backup，再读取当前配置
  - Codex `auth.json` 兼容读取 `OPENAI_API_KEY`、`api_key` 等字段
- 路由停用接口职责：
  - `/api/routes/deactivate-all` 仅停用路由，不执行配置恢复
  - 配置恢复统一由服务终止信号触发
- MCP 例外说明：
  - MCP 同步仍会在相关路由/MCP 操作时更新 `.claude.json` 的 `mcpServers`
  - 该行为属于 MCP 配置同步，不属于代理主配置生命周期写入逻辑

**相关模块**
- `src/server/config-managed-fields.ts`：管理字段定义
- `src/server/config-merge.ts`：JSON/TOML 智能合并与原子写入
- `src/server/config-metadata.ts`：配置状态与元数据管理
- `src/server/main.ts`：生命周期写入/恢复与配置 API
- `bin/utils/config-helpers.js`：CLI 恢复侧合并工具
- `bin/restore.js`：`aicos restore` 命令实现
- `src/server/original-config-reader.ts`：原始配置读取兜底

#### Data Import/Export
- **Export**: Exports all configuration data (vendors, services, routes, rules, config) as AES-encrypted JSON
  - Export data format version: `3.0.0`
  - Vendors contain nested services array (current format)
- **Import**: Only supports current format (version `3.0.0`)
  - **Strict validation**: Validates all required fields for vendors, services, routes, rules
  - **Preview feature**: Shows data summary (counts of vendors, services, routes, rules) before import
  - **User confirmation**: Requires explicit confirmation after preview
  - **Detailed error messages**: Returns specific validation errors if data format is invalid
  - **Breaking change**: No longer supports importing data from versions prior to 3.0.0
- **API Endpoints**:
  - `POST /api/export` - Export encrypted data
  - `POST /api/import/preview` - Preview import data (new)
  - `POST /api/import` - Import data with confirmation

### Skills Management
- Lists global Skills for Claude Code and Codex
- Provides discovery search (discover/return toggle button) and installs Skills into target tool directories

### MCP Management
- Lists and manages Model Context Protocol (MCP) tools
- Supports three types: stdio, http, sse
- Allows configuration of command, URL, headers, and environment variables
- One-click installation for GLM MCP tools (Vision, Web Search, Web Reader, ZRead)
- Configures MCPs to target tools (Claude Code, Codex)
- **MCP Configuration Sync**: When a route is activated, MCP tools are automatically written to the target tool's global configuration file
  - For Claude Code: Writes to `~/.claude.json` under `mcpServers`
  - For Codex: Configuration support planned
  - MCPs are only written when there are active routes with enabled targets

### Logging
- Request logs: Detailed API call records with token usage
  - Tool requests are logged across all server-handled paths (proxy/stream/fallback/early-error)
  - `tags` include relay status per request: `通过中转` or `未通过中转`
  - Local count_tokens direct-return requests include tag: `系统计算Token直返`
- Access logs: System access records
- Error logs: Error and exception records with comprehensive context
  - **Error Log Details**:
    - Basic error information: timestamp, method, path, status code, error message, error stack
    - Request context: targetType (client type), requestModel (requested model)
    - Routing context: ruleId (used rule), targetServiceId/Name (API service), targetModel (actual model)
    - Vendor context: vendorId/Name (service provider)
    - Request details: request headers, request body, response headers, response body
    - **Upstream Request Information**: URL, headers, body, proxy usage (actual request sent to upstream API)
    - **Upstream Response Body**: Actual response body sent to the client after transformation
      - For stream responses: Stores the SSE chunks array (actual format sent to client, after transformation)
      - For non-stream responses: Stores the JSON response body
    - Response time metrics
    - **Tags**: Array of labels for special request characteristics (e.g., "使用原始配置")
- **Data Sanitization**:
  - Sensitive authentication fields (api_key, authorization, password, secret, etc.) are automatically masked in the UI
  - Technical fields like `max_tokens`, `input_tokens`, `output_tokens` are NOT masked - they are legitimate API parameters
- **Session Management**:
  - Tracks user sessions based on session ID (Claude Code: `metadata.user_id`, Codex: `headers.session_id`)
  - Auto-generates session title from first user message content:
    - Extracts text from first user message
    - Cleans up whitespace and newlines
    - Intelligently truncates at word boundaries (max 100 chars)
    - Adds "..." for truncated titles
  - Records first request time, last request time, request count, and total tokens per session

### Usage Limits Auto-Sync
- **Service-Level Limits**: API services can have token and request count limits configured
- **Auto-Sync to Rules**: When an API service's usage limits are modified, all rules using that service are automatically updated with the new limits
- **Inheritance Detection**: When editing a rule, the system detects if the rule's limits match the service's limits and displays them as "inherited" (read-only)
- **Manual Override**: Rules can be configured with custom limits that differ from the service defaults

## Development Tips

1. **Environment Variables**: Copy `.env.example` to `.env` and modify as needed
2. **Data Directory**: Default: `~/.aicodeswitch/data/` (JSON files)
3. **Config File**: `~/.aicodeswitch/aicodeswitch.conf` (HOST, PORT, AUTH)
4. **Dev Ports**: UI (4568), Server (4567) - configured in `vite.config.ts` and `server/main.ts`
5. **Skills Search**: `SKILLSMP_API_KEY` is required for Skills discovery via SkillsMP
6. **API Endpoints**: All routes are prefixed with `/api/` except proxy routes (`/claude-code/`, `/codex/`)

### Tauri Development Tips

1. **First-Time Setup**:
   - Install Rust toolchain before running Tauri commands
   - Run `npm run tauri:dev` to verify setup is correct
   - Check Rust compilation errors in the terminal

2. **Development Workflow**:
   - Use `npm run dev` for web development (faster iteration)
   - Use `npm run tauri:dev` when testing desktop-specific features
   - React UI directly communicates with Node.js backend via HTTP

3. **Backend Process Management**:
   - In Tauri mode, the Rust process automatically manages the Node.js backend
   - In web mode, you manually start the backend with `npm run dev:server`
   - The backend always runs on localhost:4567 (configurable via `~/.aicodeswitch/aicodeswitch.conf`)
   - React UI uses standard HTTP requests (fetch/axios) to communicate with backend
   - **Service Detection**: On startup, Tauri app checks if port is already in use
     - If a Node.js server is already running (e.g., started via `aicos start`), the app will connect to it instead of starting a new process
     - This prevents conflicts when users have both the CLI tool and desktop app installed

4. **Debugging**:
   - **Frontend**: Use browser DevTools (F12 in Tauri window)
   - **Backend**: Check Node.js console output
   - **Rust**: Use `println!` or `eprintln!` for logging
   - **Build Issues**: Check `tauri/target/` for detailed error logs

5. **Icon Generation**:
   - Prepare a 512x512 PNG source image
   - Run `npm run tauri:icon path/to/icon.png`
   - Icons are generated in `tauri/icons/`

6. **Node.js Detection**:
   - Tauri app checks for Node.js installation on startup (production mode only)
   - Checks by running `node --version` command
   - If Node.js is not installed, a friendly error dialog is displayed:
     - Title: "Node.js 未安装"
     - Message includes error details and installation link (https://nodejs.org/)
     - Application window closes after the dialog
   - Most developers already have Node.js installed
   - This check is skipped in development mode

7. **Auto-Deactivate Routes on Exit**:
   - When the application is closed, it automatically deactivates all active routes
   - This prevents configuration files from remaining in an overwritten state
   - The close event is intercepted and the following steps are executed:
     1. Fetch all routes via `GET /api/routes`
     2. Filter for active routes
     3. Send `POST /api/routes/:id/deactivate` for each active route
     4. Stop the Node.js server
     5. Destroy the window
   - This feature only works in production mode
   - If deactivation fails, the app still proceeds with shutdown to avoid hanging

### Project Structure

```
aicodeswitch/
├── src/
│   ├── ui/                      # React frontend
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/
│   │   ├── pages/
│   │   └── hooks/
│   └── server/                  # Node.js backend
│       ├── main.ts
│       ├── config.ts
│       ├── database-factory.ts  # Database factory
│       ├── fs-database.ts       # JSON file-based database manager
│       ├── proxy-server.ts
│       └── transformers/
├── tauri/                   # Tauri desktop application
│   ├── src/
│   │   └── main.rs              # Rust main process
│   ├── icons/                   # Application icons
│   ├── Cargo.toml               # Rust dependencies
│   ├── tauri.conf.json          # Tauri configuration
│   └── build.rs                 # Build script
├── dist/                        # Build output
│   ├── ui/                      # Frontend build
│   └── server/                  # Backend build
├── bin/                         # CLI scripts
│   ├── cli.js
│   ├── start.js
│   ├── stop.js
│   ├── restart.js
├── types/                       # TypeScript types
├── documents/                   # Documentation
│   ├── tauri-research.md        # Tauri migration research
│   └── TAURI_BUILD_GUIDE.md    # Tauri build guide
├── package.json
├── vite.config.ts
├── tsconfig.json
└── CLAUDE.md                    # This file
```

## Build and Deployment

### Traditional CLI/Web Deployment

1. Run `npm run build` to create production builds
2. UI build outputs to `dist/ui/` (static files)
3. Server build outputs to `dist/server/` (JavaScript)
4. Configuration files are created in user's home directory on first run

### Tauri Desktop Application Build

#### Prerequisites

**Install Rust Toolchain:**
```bash
# Windows, macOS, Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**Install Node.js:**
- Node.js is **required** to run the application backend
- Download from: https://nodejs.org/ (LTS version recommended)
- The application will check for Node.js installation on startup and display a friendly error message if not found

**Platform-Specific Requirements:**

- **Windows**:
  - Microsoft Visual Studio C++ Build Tools
  - WebView2 (usually pre-installed on Windows 10/11)

- **macOS**:
  - Xcode Command Line Tools: `xcode-select --install`

- **Linux**:
  ```bash
  # Debian/Ubuntu
  sudo apt install libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
  ```

#### Build Process

1. **Generate Application Icons** (optional, if you have a custom icon):
   ```bash
   npm run tauri:icon path/to/your/icon.png
   ```

2. **Development Mode**:
   ```bash
   npm run tauri:dev
   ```
   This will:
   - Start the Vite dev server for the UI
   - Compile the Rust code
   - Launch the Tauri window with hot-reload

3. **Production Build**:
   ```bash
   npm run tauri:build
   ```
   This will:
   - Build the React UI (`npm run build:ui`)
   - Build the Node.js server (`npm run build:server`)
   - Compile the Rust code in release mode
   - Bundle the application with all resources
   - Create platform-specific installers

#### Build Output

**Windows:**
- `tauri/target/release/aicodeswitch.exe` - Executable
- `tauri/target/release/bundle/msi/` - MSI installer
- `tauri/target/release/bundle/nsis/` - NSIS installer

**macOS:**
- `tauri/target/release/aicodeswitch` - Executable
- `tauri/target/release/bundle/dmg/` - DMG installer
- `tauri/target/release/bundle/macos/` - .app bundle

#### Application Size Comparison

| Build Type | Size | Notes |
|------------|------|-------|
| Tauri (without Node.js) | ~10-20 MB | Requires Node.js pre-installed |
| Tauri (with Node.js) | ~50-70 MB | Bundles Node.js runtime |
| Traditional Electron | ~150-200 MB | Bundles Chromium + Node.js |

### Tauri Hybrid Architecture Details

The Tauri build uses a **hybrid approach** that preserves the existing Node.js backend:

1. **Tauri Main Process (Rust)**:
   - Manages application lifecycle
   - Creates and controls the WebView window
   - Spawns and monitors the Node.js backend process
   - Provides IPC commands for frontend-backend communication

2. **Node.js Backend Process**:
   - Runs the existing Express server unchanged
   - Handles all proxy logic, API transformations, and database operations
   - Listens on localhost:4567 (configurable)

3. **React Frontend (WebView)**:
   - Rendered in the system's native WebView
   - Communicates with Node.js backend via HTTP (localhost)
   - Uses standard fetch/axios for API requests
   - No special Tauri integration required in React code

**Key Benefits:**
- ✅ No backend rewrite required
- ✅ All existing Node.js code works as-is
- ✅ Significantly smaller application size
- ✅ Better system integration
- ✅ Cross-platform support (Windows, macOS)
- ✅ Future migration path to full Rust backend if desired

## Technology Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express
- **Language**: TypeScript
- **Database**: JSON File Storage (no database dependencies)
- **Streaming**: SSE (Server-Sent Events)
- **HTTP Client**: Axios
- **Encryption**: CryptoJS (AES)

### Frontend
- **Framework**: React 18
- **Language**: TypeScript
- **Build Tool**: Vite
- **Routing**: React Router
- **UI Components**: Custom components

### Desktop Application (Tauri)
- **Core**: Tauri 2.0
- **Language**: Rust (main process)
- **WebView**: System native (WebView2 on Windows, WebKit on macOS)
- **IPC**: Tauri command system
- **Process Management**: Rust std::process

### CLI
- **Implementation**: Custom Yargs-like CLI
- **Process Management**: Node.js child_process

## CI/CD Pipeline

### NPM 发布流程
当 PR 合并到 main 分支时，自动触发 npm 发布：
1. 检查当前版本是否已被 npm 注册（使用 `can-npm-publish`）
2. 若当前版本未发布，直接使用该版本发布；否则运行 `npm run release` 创建新版本
3. 发布到 npm registry
4. 推送 tag 到 GitHub

### Tauri 应用构建流程
npm 发布成功后，自动触发 Tauri 应用构建：
1. **触发条件**:
   - "Publish To NPM" 工作流成功完成
   - 或手动触发（可指定版本号）

2. **构建矩阵**:
   - **macOS**: (两个架构分别构建)
     - Intel (x86_64): `.dmg`, `.app`
     - Apple Silicon (aarch64): `.dmg`, `.app`
   - **Windows**: Windows Latest (x86_64)
     - 输出: `.msi`, `.exe` (NSIS)

3. **发布到 GitHub Release**:
   - 自动创建或更新 Release
   - 上传所有平台的安装包
   - 包含下载说明和系统要求

4. **手动触发构建**:
   - 在 GitHub Actions 页面选择 "Build and Release Tauri App"
   - 可选：指定版本号（不指定则使用 package.json 中的版本）

### 工作流文件
- `.github/workflows/publish-to-npm.yaml` - NPM 发布
- `.github/workflows/build-tauri.yaml` - Tauri 构建和发布

## 最近变更

- 2026-03-11: 修复 Claude Code → Gemini thinking 参数冲突
  - 当存在 `budget_tokens` 时，Gemini `thinkingConfig` 仅写入 `thinkingBudget`，不再同时写入 `thinkingLevel`
  - 同步修复 `transformRequestFromClaudeToGemini` 与 `transformRequestFromResponsesToGemini`，避免 400 `You can only set only one of thinking budget and thinking level`

## Development

* 使用yarn作为包管理器，请使用yarn安装依赖，使用yarn来运行脚本。
* 前端依赖库安装在devDependencies中，请使用yarn install --dev安装。
* 所有对话请使用中文。生成代码中的文案及相关注释根据代码原本的语言生成。
* 在服务端，直接使用 __dirname 来获取当前目录，不要使用 process.cwd()
* 每次有新的架构变化时，你需要更新 CLAUDE.md, AGENTS.md 来让文档保持最新。
* 每次有变更，以非常简单的概述，将变化内容记录到 CHANGELOG.md 中。
* 禁止在ui中使用依赖GPU的css样式。
* 禁止运行 dev:ui, dev:server, tauri:dev 等命令来进行测试。
* 如果你需要创建文档，必须将文档放在 documents 目录下
* 如果你需要创建测试脚本，必须将脚本文件放在 scripts 目录下
* currentDate: Today's date is 2026-02-20.

**注意，codex已经不再支持 `wire_api = "chat"` 的设置了，因此，由codex发起的请求，一定是和 Responses API 的请求数据一致。**

## 禁止执行

- 禁止使用 git 命令来恢复代码，避免手动修改的代码被恢复后功能丢失
