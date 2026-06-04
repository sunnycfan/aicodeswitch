# PRD: API 路径路由映射（Route Path Binding）

**文档版本:** 1.1  
**创建日期:** 2026-06-03  
**最后更新:** 2026-06-04  
**状态:** Implemented

---

## 1. 背景与动机

当前 AI Code Switch 通过 `/claude-code` 和 `/codex` 两个前缀路径对外提供代理服务。这两个路径分别对应 Claude Code 和 Codex 两款编程工具，系统的路由对象（`Route`）也以 `targetType: 'claude-code' | 'codex'` 来标识客户端工具类型。

这种设计的局限性：

- 只能为 Claude Code 和 Codex 两款工具服务，其他编程工具（如 Cursor、Windsurf、Cline 等）无法直接接入。
- 路由匹配依赖"客户端工具类型"概念，而非标准 API 路径，不具备通用性。
- 每新增一种编程工具，就需要在前端、后端、类型系统中新增对应的 `ToolType`，扩展成本高。

**目标：** 在不破坏现有 `/claude-code` 和 `/codex` 功能的前提下，新增对 5 个标准 API 路径的支持（含 `/v1/models` 可自定义模型列表），使任何兼容标准 API 的编程工具都能直接使用 AI Code Switch。

---

## 2. 核心概念

### 2.1 标准 API 路径

| API 路径 | 协议格式 | 对应的 `Format` |
|---|---|---|
| `/v1/messages` | Anthropic Claude Messages API | `claude` |
| `/v1/responses` | OpenAI Responses API | `responses` |
| `/v1/chat/completions` | OpenAI Chat Completions API | `completions` |
| `/v1beta/models/{model}:generateContent` | Google Gemini GenerateContent API | `gemini` |
| `/v1beta/models/{model}:streamGenerateContent` | Google Gemini Stream API | `gemini` |
| `/v1/models` | 模型列表查询（可自定义） | - |

> Gemini 的两个 endpoint 在路由层面视为同一个，因为 `generateContent` / `streamGenerateContent` 的选择由 stream 参数决定，不需要单独绑定路由。

### 2.2 路由映射（Route Path Binding）

一个**路由映射**就是一条记录："哪个 API 路径由哪个路由提供服务"。

```
API 路径           →  路由 ID
─────────────────────────────────
/v1/messages       →  route-abc123
/v1/responses      →  route-def456
/v1/chat/completions → (未绑定)
/v1beta/models/*   →  route-xyz789
```

### 2.3 客户端格式推断

当请求通过标准 API 路径进入时，系统**不需要**依赖 `ToolType` 来判断客户端格式，而是直接根据 API 路径本身推断：

- `/v1/messages` → 客户端格式为 `claude`
- `/v1/responses` → 客户端格式为 `responses`
- `/v1/chat/completions` → 客户端格式为 `completions`
- `/v1beta/models/{model}:*` → 客户端格式为 `gemini`

这使得系统彻底摆脱了"必须知道客户端是什么工具"的限制。

---

## 3. 用户故事

作为 AI Code Switch 用户，我希望：

1. 在"路由管理"页面顶部看到一个"路由映射"板块。
2. 在该板块中，4 个可绑定的 API 路径各占一行，每行有一个下拉选择器，列出我已创建的所有路由名称。
3. `/v1/models` 行显示为文本输入框，可自定义模型列表（英文逗号分隔），留空则使用默认列表。
4. 选择路由后保存，外部工具就可以通过对应的 API 路径访问我绑定的路由。
5. 未绑定的 API 路径不响应代理请求（返回 404）。
6. 我可以让多个 API 路径绑定到同一个路由。
7. 我现有的 `/claude-code` 和 `/codex` 路径不受任何影响。

---

## 4. 功能需求

### 4.1 数据模型

#### 4.1.1 新增类型 `ApiPathBinding`

```typescript
// src/types/index.ts

/** 标准 API 路径枚举 */
export type ApiPath =
  | '/v1/messages'
  | '/v1/responses'
  | '/v1/chat/completions'
  | '/v1beta/models'
  | '/v1/models';

/** 路径与路由的绑定关系 */
export interface ApiPathBinding {
  apiPath: ApiPath;
  routeId: string | null;   // null 表示未绑定
}
```

#### 4.1.2 独立存储

路由映射数据使用**独立存储文件** `~/.aicodeswitch/fs-db/api-path-bindings.json`，不混入 `AppConfig`（`config.json`），避免数据污染。

文件格式：

```json
{
  "bindings": [
    { "apiPath": "/v1/messages", "routeId": null },
    { "apiPath": "/v1/responses", "routeId": null },
    { "apiPath": "/v1/chat/completions", "routeId": null },
    { "apiPath": "/v1beta/models", "routeId": null },
    { "apiPath": "/v1/models", "routeId": null }
  ],
  "models": ""
}
```

- `bindings`: 5 个 API 路径的绑定关系。
- `models`: `/v1/models` 的自定义模型列表字符串，英文逗号分隔。留空则使用代码中的默认列表。

默认值（首次加载时自动创建）：

```typescript
const defaults: ApiPathBinding[] = [
  { apiPath: '/v1/messages', routeId: null },
  { apiPath: '/v1/responses', routeId: null },
  { apiPath: '/v1/chat/completions', routeId: null },
  { apiPath: '/v1beta/models', routeId: null },
  { apiPath: '/v1/models', routeId: null },
];
```

#### 4.1.3 不修改现有 Route / Rule 类型

现有的 `Route.targetType: ToolType` 保持不变。绑定时，一个 API 路径可以绑定到任意 `targetType` 的路由。系统在处理请求时，从 API 路径推断客户端格式（`Format`），不再依赖 `Route.targetType` 来确定格式。

#### 4.1.4 不修改 AppConfig

路由映射数据不写入 `AppConfig`。`AppConfig` 中不含 `apiPathBindings` 和 `apiPathModels` 字段。

### 4.2 后端逻辑

#### 4.2.1 请求入口：Express 中间件

在 `proxy-server.ts` 的 `initialize()` 方法中，现有中间件**之前**新增一段逻辑：

```
收到请求
  ↓
是否为 /v1/models？
  ├─ 是 → 根据 models 配置生成并返回模型列表（不走代理）
  ↓
是否匹配其余 4 个标准 API 路径之一？
  ├─ 否 → 交给现有 /claude-code、/codex 逻辑（完全不变）
  └─ 是 → 从 dbManager 读取绑定，查找该路径绑定的 routeId
           ├─ 未绑定 → 返回 404
           └─ 已绑定 → 加载对应的 Route 对象
                       ↓
                       从 API 路径推断 clientFormat
                       ↓
                       使用该 Route 的规则执行代理
                       （复用现有的规则匹配、故障切换、格式转换逻辑）
```

**关键：** 这段新逻辑是一个独立的前置中间件，与现有的 `SUPPORTED_TARGETS` 逻辑完全并行，互不干扰。

#### 4.2.2 路径匹配规则

| 请求路径 | 匹配的 ApiPath |
|---|---|
| `/v1/messages` | `/v1/messages` |
| `/v1/messages/count_tokens` | `/v1/messages` |
| `/v1/responses` | `/v1/responses` |
| `/v1/chat/completions` | `/v1/chat/completions` |
| `/v1beta/models/gemini-3-pro:generateContent` | `/v1beta/models` |
| `/v1beta/models/gemini-3-pro:streamGenerateContent` | `/v1beta/models` |
| `/v1/models` | `/v1/models`（返回模型列表，不走代理） |

匹配逻辑（伪代码）：

```typescript
function matchApiPath(reqPath: string): ApiPath | null {
  const p = reqPath.split('?')[0];  // 去掉 query string
  if (p === '/v1/messages' || p.startsWith('/v1/messages/')) return '/v1/messages';
  if (p === '/v1/responses') return '/v1/responses';
  if (p === '/v1/chat/completions') return '/v1/chat/completions';
  if (/^\/v1beta\/models\//.test(p)) return '/v1beta/models';
  if (p === '/v1/models') return '/v1/models';
  return null;
}
```

#### 4.2.3 客户端格式推断

```typescript
function apiPathToClientFormat(apiPath: ApiPath): Format | null {
  switch (apiPath) {
    case '/v1/messages': return 'claude';
    case '/v1/responses': return 'responses';
    case '/v1/chat/completions': return 'completions';
    case '/v1beta/models': return 'gemini';
    case '/v1/models': return null;  // 不涉及格式转换，直接返回模型列表
  }
}
```

#### 4.2.4 `/v1/models` 模型列表

`/v1/models` 是一个特殊的 API 路径，不绑定路由，始终返回模型列表。

**触发条件：** 请求路径精确匹配 `/v1/models`（忽略 query string）。

**返回格式：** 兼容 OpenAI `/v1/models` 响应格式：

```json
{
  "object": "list",
  "data": [
    {
      "id": "claude-sonnet-4-20250514",
      "object": "model",
      "created": 1747267200,
      "owned_by": "custom"
    }
  ]
}
```

**模型列表来源：**
- 如果用户在 UI 中自定义了模型列表（英文逗号分隔），则使用自定义列表。
- 如果自定义列表为空，则使用代码中的默认列表（包含 Claude、GPT、Gemini、DeepSeek 等主流模型 ID）。

**鉴权：** 如果系统配置了 `config.apiKey`，则 `/v1/models` 也需要验证 `Authorization: Bearer <key>`。未配置 apiKey 时不鉴权。

#### 4.2.5 代理处理逻辑

当请求通过标准 API 路径进入时，核心代理流程：

1. **加载路由：** 从 `dbManager.getApiPathBindings()` 获取绑定，查找 `routeId`，从数据库加载 `Route` 对象。
2. **确定客户端格式：** `clientFormat = apiPathToClientFormat(apiPath)`。
3. **规则匹配：** 复用现有的 `findMatchingRule` / `getAllMatchingRules`，按 `contentType` 匹配。
4. **获取上游服务：** 复用现有的 `getServiceById`。
5. **确定上游格式：** 复用现有的 `sourceTypeToFormat(service.sourceType)`。
6. **格式转换：** 使用 `transformRequest(fromFormat=clientFormat, toFormat=upstreamFormat)`，不再依赖 `tool === 'codex' ? 'responses' : 'claude'` 的硬编码。
7. **构建上游 URL：** 使用 `mapApiPathToUpstreamUrl` 根据上游格式构建 URL。
8. **流式/非流式处理：** 复用现有的 pipeline 逻辑。
9. **响应转换：** 使用 `transformResponse(fromFormat=upstreamFormat, toFormat=clientFormat)`。
10. **日志记录：** 不记录 `targetType`（该字段为 `undefined`）。

#### 4.2.6 特殊场景处理

**compact 请求：**
- compact 响应的清理逻辑根据 `clientFormat` 而非 `targetType` 判断。当前使用 `clientFormat === 'claude'` 进行 compact 清理。

**count_tokens 请求：**
- `/v1/messages/count_tokens` 请求保持现有本地计算逻辑不变。

**Gemini stream：**
- `/v1beta/models/{model}:streamGenerateContent` 需要追加 `?alt=sse` 参数，复用现有的 `buildGeminiUrl` 逻辑。

**Session 追踪：**
- `sessionId` 提取逻辑需要适配新路径。

**错误响应格式：**
- 错误响应格式匹配 `clientFormat`：
  - `claude` 格式：`{ type: 'error', error: { type: 'api_error', message: '...' } }`
  - `responses` / `completions` 格式：`{ error: { message: '...' } }`
  - `gemini` 格式：`{ error: { code: ..., message: '...' } }`

#### 4.2.7 日志记录行为

通过标准 API 路径接入的请求，在日志记录中**不包含"客户端类型"（targetType）信息**。

- `logToolRequest` 调用时不传 `targetType` 参数，该字段为 `undefined`。
- 前端日志列表中，"客户端类型"列显示为 `-`（已有逻辑：`TARGET_TYPE[log.targetType!]` 找不到时显示 `-`）。
- 日志详情中，"客户端类型"行不展示（已有逻辑：`if (log.targetType)` 判断）。
- 统计页面中，这些请求不纳入按 `targetType` 分组的统计。

这与 `/claude-code`、`/codex` 路径的日志行为（始终记录 `targetType`）形成区分，因为标准 API 路径的客户端工具不限于特定类型。

#### 4.2.8 API 端点

新增以下管理 API：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/api-path-bindings` | 获取当前所有路径绑定和自定义模型列表 |
| PUT | `/api/api-path-bindings` | 批量更新路径绑定和自定义模型列表 |

`GET` 响应体：

```json
{
  "bindings": [
    { "apiPath": "/v1/messages", "routeId": "route-abc123" },
    { "apiPath": "/v1/responses", "routeId": null },
    { "apiPath": "/v1/chat/completions", "routeId": "route-def456" },
    { "apiPath": "/v1beta/models", "routeId": null },
    { "apiPath": "/v1/models", "routeId": null }
  ],
  "models": "claude-sonnet-4-20250514, gpt-5.4, gemini-3-pro-preview"
}
```

`PUT` 请求体：

```json
{
  "bindings": [
    { "apiPath": "/v1/messages", "routeId": "route-abc123" },
    { "apiPath": "/v1/responses", "routeId": null },
    { "apiPath": "/v1/chat/completions", "routeId": "route-def456" },
    { "apiPath": "/v1beta/models", "routeId": null },
    { "apiPath": "/v1/models", "routeId": null }
  ],
  "models": "claude-sonnet-4-20250514, gpt-5.4, gemini-3-pro-preview"
}
```

验证规则：
- `routeId` 如果不为 null，必须指向一个已存在的 `Route`。
- `apiPath` 必须是 5 个枚举值之一。
- 允许多个 `apiPath` 绑定到同一个 `routeId`。
- `/v1/models` 的 `routeId` 始终为 null（不接受绑定）。
- `models` 为可选字段，英文逗号分隔模型 ID，留空使用默认列表。

### 4.3 前端 UI

#### 4.3.1 路由映射板块

在 `RoutesPage.tsx` 页面顶部（现有路由列表上方）新增"路由映射"板块：

```
┌─────────────────────────────────────────────────────────────┐
│  API 路径路由映射                                             │
│  将标准 API 路径绑定到路由，使任何兼容该 API 的编程工具...     │
│                                                               │
│  /v1/messages                        [▼ 选择路由...        ] │
│  /v1/responses                       [▼ 选择路由...        ] │
│  /v1/chat/completions                [▼ 选择路由...        ] │
│  /v1beta/models/{model}:{action}     [▼ 选择路由...        ] │
│  /v1/models                          [自定义模型，英文逗号分隔] │
│                                                               │
│                                            [保存映射]         │
└─────────────────────────────────────────────────────────────┘
```

**交互细节：**
- 每个路径独占一行。路径部分使用 `<code>` 标签，宽度固定 260px，保持所有行对齐。
- 4 个可绑定路径的右侧是下拉选择器，选项仅显示路由名称（不附带工具类型标签）。
- `/v1/models` 行的右侧是文本输入框，placeholder 为"自定义模型列表，英文逗号分隔，留空使用默认列表"。
- `/v1beta/models` 在 UI 中展示为 `/v1beta/models/{model}:{action}`。
- "保存映射"按钮使用大按钮样式（padding: 8px 32px, fontSize: 14px）。
- 保存成功后显示 toast 提示。
- 页面加载时调用 `GET /api/api-path-bindings` 填充当前绑定状态和模型列表。

#### 4.3.2 前端 API Client

在 `src/ui/api/client.ts` 中新增：

```typescript
getApiPathBindings: () => requestJson(buildUrl('/api/api-path-bindings')),
updateApiPathBindings: (bindings: ApiPathBinding[], models?: string) =>
  requestJson(buildUrl('/api/api-path-bindings'), {
    method: 'PUT',
    body: JSON.stringify({ bindings, models }),
  }),
```

---

## 5. 非功能需求

### 5.1 向后兼容

- 现有 `/claude-code` 和 `/codex` 路径的所有行为不变。
- 现有数据库中的 `Route`、`Rule` 数据结构不变。
- 现有 API（`/api/routes`、`/api/rules` 等）不变。
- 现有日志格式不变（`targetType` 字段保持）。
- 现有配置写入/恢复（`write-config/claude`、`write-config/codex`）不变。
- 现有 `AppConfig`（`config.json`）不受影响，路由映射数据使用独立存储文件。

### 5.2 数据隔离

- 路由映射数据存储在独立文件 `api-path-bindings.json` 中，与 `config.json` 完全分离。
- `fs-database.ts` 提供专用方法 `getApiPathBindings()`、`getApiPathModels()`、`updateApiPathBindings()` 读写该文件。
- 不污染 `AppConfig`，不通过 `updateConfig` 写入。

### 5.3 性能

- 路径绑定的查找从 `dbManager` 实时读取，与现有路由规则读取方式一致。
- 不影响现有 `/claude-code`、`/codex` 请求的性能（新逻辑在最前面短路判断，不匹配则立即放行）。

### 5.4 数据迁移

- 不需要迁移。`api-path-bindings.json` 首次加载时自动创建，包含 5 个未绑定记录和空的模型列表。
- 用户首次进入页面时看到全部"未绑定"，手动选择并保存即可。

---

## 6. 不在范围内

以下内容本次不实施：

- 删除或重构 `/claude-code`、`/codex` 路径。
- 修改 `ToolType` 类型定义。
- 修改现有的路由（Route）和规则（Rule）的数据结构。
- 自动配置外部编程工具（如自动修改 Cursor 的 settings.json）。
- 动态获取模型列表（`/v1/models` 返回用户自定义列表或默认列表，不从上游实时拉取）。
- API Key 鉴权增强（标准 API 路径沿用现有的 `config.apiKey` 校验）。

---

## 7. 实施步骤

### Phase 1: 后端基础

1. 在 `src/types/index.ts` 中新增 `ApiPath` 和 `ApiPathBinding` 类型。
2. 在 `fs-database.ts` 中新增独立存储 `api-path-bindings.json`，提供 `getApiPathBindings()`、`getApiPathModels()`、`updateApiPathBindings()` 方法。
3. 在 `main.ts` 中新增 `GET /api/api-path-bindings` 和 `PUT /api/api-path-bindings` 端点。
4. 在 `proxy-server.ts` 中新增标准 API 路径的前置中间件：
   - `/v1/models` 根据 `dbManager.getApiPathModels()` 生成模型列表
   - 其余 4 个路径：路径匹配 → 绑定查找 → 客户端格式推断 → 代理执行（复用现有规则匹配、格式转换、流处理逻辑）

### Phase 2: 前端 UI

5. 在 `src/ui/api/client.ts` 中新增 API 调用方法（含 `models` 参数）。
6. 在 `RoutesPage.tsx` 顶部实现"路由映射"板块（4 个下拉选择器 + 1 个文本输入框）。

### Phase 3: 测试与文档

7. 手动测试 5 个 API 路径（含 `/v1/models` 自定义模型列表）。
8. 测试与现有 `/claude-code`、`/codex` 的并行使用。
9. 更新 `AGENTS.md` 和 `CHANGELOG.md`。

---

## 8. 风险评估

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 标准 API 路径与现有管理 API 路径冲突 | 低 | 管理API都在 `/api/` 前缀下，标准路径不与 `/api/` 重叠，无冲突 |
| compact 逻辑依赖 `targetType === 'claude-code'` | 中 | 新逻辑改为根据 `clientFormat` 判断，保持现有 compact 逻辑对 `targetType` 的依赖不变 |
| Gemini 路径需要动态匹配 model name | 低 | 使用正则 `/^\/v1beta\/models\//` 前缀匹配即可 |
| 现有用户不知道新功能 | 低 | UI 中直接可见，无需额外引导 |
| 多个路径绑定同一路由时的并发请求 | 低 | 路由本身是无状态的，多路径绑定只是多个入口指向同一个规则集 |
| 路由映射数据与 AppConfig 混淆 | 低 | 使用独立存储文件，不写入 AppConfig |

---

## 9. 未来展望

- **API Key 分路径：** 不同路径使用不同的 API Key，实现多租户隔离。
- **路径级别的速率限制：** 每个 API 路径独立的频率限制。
- **自动发现：** 自动检测本地安装的编程工具并推荐路径绑定。
- **TLS 支持：** 为标准 API 路径提供 HTTPS，使更多工具无需额外配置即可接入。
- **动态模型列表：** 从上游服务实时拉取可用模型，替代当前的手动输入方式。
