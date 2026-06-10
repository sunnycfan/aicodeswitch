# AICodeSwitch AccessKey 接入 — 产品需求文档 (PRD)

> **版本**: v1.0.0-draft
> **日期**: 2026-06-09
> **状态**: 草稿 — 待评审

---

## 目录

1. [项目背景与设计理念](#1-项目背景与设计理念)
2. [核心概念](#2-核心概念)
3. [功能需求](#3-功能需求)
4. [数据模型](#4-数据模型)
5. [API 设计](#5-api-设计)
6. [代理请求处理流程](#6-代理请求处理流程)
7. [UI 设计](#7-ui-设计)
8. [技术方案](#8-技术方案)
9. [非功能需求](#9-非功能需求)
10. [与现有系统的兼容](#10-与现有系统的兼容)
11. [分期交付计划](#11-分期交付计划)
12. [风险与缓解](#12-风险与缓解)
13. [附录](#附录)

---

## 1. 项目背景与设计理念

### 1.1 现状

AICodeSwitch 目前是单用户本地代理：管理员在本地配置好供应商（Vendor）、路由（Route）、规则（Rule）后，通过写入 Claude Code / Codex 的配置文件，让编程工具的请求经过本地代理转发到上游 AI 服务。

这套机制只能服务本地一台机器上的工具。当团队中的其他人也需要使用时，要么每个人各自部署一套 AICodeSwitch，要么就需要一种新的共享接入方式。

### 1.2 核心理念：API Key 即身份

> **我们不引入「用户」概念，而是通过 API Key 直接绑定策略来实现多端接入。**

设计原则：

| 原则 | 说明 |
|------|------|
| **无用户体系** | 不需要注册、登录、角色、权限。API Key 本身就是身份和凭证 |
| **零配置接入** | 接入方只需拿到一个 API Key，填入工具配置即可使用 |
| **策略即全部** | 每个 API Key 绑定一个「策略」，策略中包含路由选择 + 配额限制，一站式管理 |
| **独立审计空间** | 每个 API Key 有独立的统计和日志空间，互不干扰 |
| **最小侵入** | 作为现有 AICodeSwitch 的子模块，不改变现有架构，复用代理引擎 |

### 1.3 典型场景

> **小团队共享**：团队 Leader 在自己的电脑上运行 AICodeSwitch，配置好供应商和路由。然后创建 5 个 API Key，每个 Key 绑定相同的策略（限定了每天 50 万 Token），分发给 5 位团队成员。成员只需在 Claude Code 中设置 `ANTHROPIC_BASE_URL=http://leader-ip:4567` 和 `ANTHROPIC_AUTH_TOKEN=sk_xxxx` 即可使用。

> **企业内部共享**：IT 管理员在公司服务器部署 AICodeSwitch，创建不同策略对应不同部门（VIP 策略无限制，普通策略限额）。为每个员工生成一个 API Key 并绑定对应策略。IT 管理员可在后台查看每个 Key 的使用情况。

---

## 2. 核心概念

### 2.1 概念总览

```
┌─────────────────────────────────────────────────────────┐
│                   AICodeSwitch                          │
│                                                         │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │  Access Key  │    │   Policy     │    │   Route   │  │
│  │  (接入密钥)  │───▶│  (策略)      │───▶│  (路由)   │  │
│  └─────────────┘    └──────────────┘    └───────────┘  │
│        │                   │                            │
│        │                   ├── 配额限制                  │
│        │                   └── 路由绑定                  │
│        │                                                │
│        ├── 独立统计空间                                   │
│        └── 独立日志空间                                   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │            现有代理引擎 (Proxy Engine)             │    │
│  │  供应商 → 规则匹配 → 格式转换 → 上游转发          │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Access Key（接入密钥）

系统生成的 API Key，前缀为 `sk_`。每个 Key 的本质是一条接入凭证——持有该 Key 的客户端可以向 AICodeSwitch 发起代理请求。

**关键属性**：
- 唯一标识（id）
- API Key 值（`sk_` 前缀，系统自动生成，不可自定义）
- 绑定的策略（Policy）
- 状态（启用/停用）
- 名称/备注（方便管理员识别「这个 Key 给谁用的」）
- 独立的统计和日志空间

### 2.3 Policy（策略）

策略是一个可复用的配置模板，定义了「接入方能用什么、用多少」：

- **路由绑定**：该策略使用哪个路由（Route）来处理请求
- **配额限制**：Token 限额、请求次数限额、频率限制、并发限制等
- **模型过滤**：允许或禁止使用的模型

多个 Key 可以共享同一个策略（例如一个团队的所有人用同一个策略），也可以每个 Key 用独立策略。

### 2.4 实体关系

```
AccessKey  N ──── 1  Policy  N ──── 1  Route
                       │
                       └── Quota (配额规则)
                       └── ModelFilter (模型过滤)
```

- 一个 Policy 可被多个 AccessKey 引用
- 一个 Policy 绑定一个 Route（现有 Route 概念不变）
- Policy 包含完整的配额配置
- 每个 AccessKey 有独立的使用统计和日志

---

## 3. 功能需求

### 3.1 功能模块总览

```
┌──────────────────────────────────────────────────────────────┐
│                   API Key 共享接入 模块                       │
├───────────────┬────────────────┬──────────────────────────────┤
│  Key 管理器    │   策略管理器    │        统计与日志            │
│               │                │                              │
│ · 创建 Key    │ · 创建策略     │ · Key 级用量总览             │
│ · 停用/启用   │ · 编辑策略     │ · Key 级请求日志             │
│ · 删除 Key    │ · 复制策略     │ · Key 级消耗趋势             │
│ · 重命名      │ · 删除策略     │ · 全局 Key 用量排行          │
│ · 查看完整Key │ · 策略预览     │ · 配额使用率监控             │
│ · 绑定策略    │                │ · 错误日志                   │
│ · 批量操作    │                │                              │
└───────────────┴────────────────┴──────────────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │   代理引擎改造       │
                    │                    │
                    │ · sk_ Key 识别     │
                    │ · 策略查询          │
                    │ · 配额检查          │
                    │ · 路由解析          │
                    │ · 独立日志记录       │
                    └────────────────────┘
```

### 3.2 F1 — 接入密钥管理（Access Key Manager）

#### F1.1 创建 Key

- 管理员在「接入密钥」页面点击「创建密钥」
- 填写信息：
  - **名称**（必填）：方便识别，如「张三 - 前端组」「测试用 Key」
  - **备注**（可选）：补充说明
  - **策略**（可选）：选择已有的策略，或选择「稍后配置」
- 系统自动生成 `sk_` 前缀的 API Key
- 创建成功后**弹窗展示完整 Key**（仅此一次完整展示，之后只显示掩码版本）
- 提示管理员复制保存

#### F1.2 密钥列表

| 列 | 说明 |
|----|------|
| 名称 | 管理员设定的名称 |
| API Key | 掩码展示（`sk_****xxxx`） |
| 策略 | 绑定的策略名称，未绑定时显示「未配置」 |
| 状态 | 启用（绿）/ 停用（灰） |
| Token 用量 | 今日已用 / 今日限额（如有限额） |
| 请求数 | 今日请求次数 |
| 最后活跃 | 最后一次请求的时间 |
| 创建时间 | 创建日期 |

**筛选能力**：
- 按状态筛选（全部 / 启用 / 停用）
- 按策略筛选
- 按名称搜索

**批量操作**：
- 批量绑定策略
- 批量停用/启用
- 批量删除

#### F1.3 密钥操作

| 操作 | 说明 |
|------|------|
| 编辑 | 修改名称、备注、绑定策略 |
| 停用/启用 | 停用后该 Key 的所有请求立即被拒绝 |
| 删除 | 删除 Key（关联的日志和统计数据**保留不删除**，通过 `keyId` 关联） |
| 重新生成 | 重新生成 API Key 值（旧 Key 立即失效，新的弹窗展示） |
| 复制 Key | 复制掩码 Key（管理场景），或提供「显示完整 Key」按钮（需二次确认） |
| 查看统计 | 跳转到该 Key 的独立统计页面 |
| 查看日志 | 跳转到该 Key 的独立日志页面 |

#### F1.4 密钥使用指引

每个密钥卡片/详情页提供**接入指引**，展示如何在不同工具中使用该 Key。
AccessKey 通过 `Authorization: Bearer`、`x-api-key`、`x-goog-api-key` 三种 Header 传递，覆盖所有主流编程工具：

**Claude Code 接入**（通过 `Authorization: Bearer`）：
```bash
# 环境变量
export ANTHROPIC_BASE_URL=http://<host>:<port>
export ANTHROPIC_AUTH_TOKEN=sk_xxxxxxxxxxxxxxxx
```

**Codex 接入**（通过 `Authorization: Bearer`）：
```bash
# 在 config.toml 和 auth.json 中配置
```

**Cursor / Continue / 其他 OpenAI 兼容工具**（通过 `Authorization: Bearer`）：
```bash
# 使用 /v1/chat/completions 端点
export OPENAI_API_KEY=sk_xxxxxxxxxxxxxxxx
export OPENAI_BASE_URL=http://<host>:<port>/v1
```

**Anthropic SDK 接入**（通过 `x-api-key`）：
```bash
# 使用 /v1/messages 端点
export ANTHROPIC_API_KEY=sk_xxxxxxxxxxxxxxxx
export ANTHROPIC_BASE_URL=http://<host>:<port>
```

**Gemini 兼容工具接入**（通过 `x-goog-api-key`）：
```bash
# 使用 Gemini 兼容端点
export GOOGLE_API_KEY=sk_xxxxxxxxxxxxxxxx
# 配置 base URL 指向 AICodeSwitch
```

### 3.3 F2 — 策略管理（Policy Manager）

#### F2.1 策略概念

策略是一个**可复用的配置包**，由以下几部分组成：

```
┌─────────────────────────────────────────┐
│                Policy                    │
├─────────────────────────────────────────┤
│  基本信息                                │
│  ├── 策略名称                            │
│  └── 策略描述                            │
├─────────────────────────────────────────┤
│  路由绑定                                │
│  └── 绑定的 Route（选择现有路由）          │
├─────────────────────────────────────────┤
│  配额限制                                │
│  ├── 日限额（Token / 请求次数）           │
│  ├── 周限额（Token / 请求次数）           │
│  ├── 月限额（Token / 请求次数）           │
│  ├── 自定义周期限额                       │
│  ├── 频率限制（RPM）                     │
│  └── 并发限制                            │
├─────────────────────────────────────────┤
│  模型过滤                                │
│  ├── 允许的模型列表（白名单）              │
│  └── 禁止的模型列表（黑名单）              │
└─────────────────────────────────────────┘
```

#### F2.2 策略 CRUD

| 操作 | 说明 |
|------|------|
| 创建策略 | 填写名称、描述，配置路由绑定、配额、模型过滤 |
| 编辑策略 | 修改任意配置，修改后实时影响所有绑定该策略的 Key |
| 复制策略 | 快速创建相似策略（修改部分参数） |
| 删除策略 | 仅允许删除未被任何 Key 引用的策略；被引用时提示「有 N 个 Key 正在使用」 |
| 策略预览 | 展示策略的完整配置和关联的 Key 数量 |

#### F2.3 配额配置详细设计

每个策略可以配置以下配额维度，**所有维度均为可选**（未配置表示不限制）：

| 维度 | 字段名 | 类型 | 说明 |
|------|--------|------|------|
| **Token 日限额** | `dailyTokenLimit` | number? | 每日 Token 消耗上限（单位：千 Token）。每日 UTC 00:00 重置 |
| **Token 周限额** | `weeklyTokenLimit` | number? | 每周 Token 消耗上限（单位：千 Token）。每周一 UTC 00:00 重置 |
| **Token 月限额** | `monthlyTokenLimit` | number? | 每月 Token 消耗上限（单位：千 Token）。每月 1 日 UTC 00:00 重置 |
| **Token 自定义周期** | `customTokenLimit` + `customTokenResetHours` | number? | 自定义周期的 Token 上限 + 周期小时数 |
| **请求日限额** | `dailyRequestLimit` | number? | 每日请求次数上限。每日 UTC 00:00 重置 |
| **请求周限额** | `weeklyRequestLimit` | number? | 每周请求次数上限。每周一 UTC 00:00 重置 |
| **请求月限额** | `monthlyRequestLimit` | number? | 每月请求次数上限。每月 1 日 UTC 00:00 重置 |
| **请求自定义周期** | `customRequestLimit` + `customRequestResetHours` | number? | 自定义周期的请求上限 + 周期小时数 |
| **频率限制** | `rpmLimit` | number? | 每分钟最大请求数（Rate Per Minute） |
| **并发限制** | `concurrentLimit` | number? | 同时进行的最大请求数 |
| **模型白名单** | `allowedModels` | string[]? | 只允许使用的模型列表。`null` 表示不限制 |
| **模型黑名单** | `blockedModels` | string[]? | 禁止使用的模型列表 |

**配额重置策略**：
- 多个周期的配额同时生效时，取最严格的（例如日限额用完即使月限额没用完也会拒绝）
- 配额检查在请求进入代理引擎时执行（前置检查），Token 用量在请求完成后回写（后置记录）
- RPM 和并发限制通过内存计数器实现，进程重启后归零

**配额优先级**：
- Key 级配额 > 策略级配额 > 规则（Rule）级配额 > 服务（Service）级配额
- 多层配额取**最严格值**

#### F2.4 策略模板

系统预置几个常用策略模板，方便快速创建：

| 模板名 | 配置 |
|--------|------|
| **不限** | 所有配额为空 |
| **轻度限制** | 月 Token 限额 5000k，日请求 500 次 |
| **中度限制** | 月 Token 限额 2000k，日 Token 限额 200k，日请求 200 次，RPM 10 |
| **严格限制** | 月 Token 限额 500k，日 Token 限额 50k，日请求 50 次，RPM 5，并发 2 |

管理员也可以保存自定义模板（可选功能）。

### 3.4 F3 — 独立统计与日志

> **数据隔离原则**：通过 AccessKey 发起的请求，其日志和统计数据**完全独立于现有系统**。现有日志模块和统计模块中**不会出现** AccessKey 请求的任何记录。两套体系互不干扰、互不可见。

#### F3.1 Key 级统计面板

每个 Key 有独立的统计空间，展示以下信息：

**概览卡片**：
- 累计 Token 消耗（Input / Output / Total）
- 累计请求数
- 成功率
- 平均响应时间

**配额使用情况**：
- 日限额：已用 / 总量（进度条 + 百分比）
- 周限额：已用 / 总量
- 月限额：已用 / 总量
- 当前 RPM（最近 1 分钟请求数）
- 当前并发数

**趋势图**：
- 按天的 Token 消耗趋势（最近 30 天）
- 按天的请求次数趋势
- 按模型的使用分布

**活跃会话**：
- 该 Key 下的活跃会话列表
- 每个会话的 Token 消耗、请求数

#### F3.2 Key 级日志空间

每个 Key 有独立的日志空间，**与现有日志系统完全隔离**：

- **完全隔离**：AccessKey 请求的日志**不会写入现有日志系统**（`logs/` 目录），现有日志页面**看不到** AccessKey 的任何请求记录
- **独立存储**：AccessKey 的日志写入独立的 `key-logs/{keyId}/` 目录，每个 Key 有自己的日志空间
- **日志内容**：与现有日志格式一致（请求/响应详情、Token 统计、耗时等），额外增加 `keyId` 和 `keyName` 字段
- **日志查看**：
  - 从 Key 管理页面进入该 Key 的日志（唯一入口）
  - 现有日志页面不展示、也不提供筛选 AccessKey 日志的入口
- **日志保留**：遵循现有日志保留策略（30 天），每个 Key 独立清理

#### F3.3 全局统计增强

AccessKey 的统计数据在**独立的统计页面**展示，**不计入现有 Usage 页面的数据**：

- **Key 用量排行**：按 Token 消耗、请求数排序的 Key 列表（独立页面）
- **Key 活跃度**：展示各 Key 的最后活跃时间
- **配额告警概览**：哪些 Key 的配额使用率已超过 80%
- **总览数字**：所有 AccessKey 的 Token 总消耗、请求总数
- **与现有统计的关系**：现有 Usage 页面的数据**仅包含通过全局 apiKey 发起的请求**，不包含任何 AccessKey 的请求

#### F3.4 错误追踪

- 按 Key 维度查看错误日志
- 错误分类统计（429 配额超限、403 权限、502 上游错误等）
- 错误率趋势

### 3.5 F4 — 代理引擎改造

#### F4.1 API Key 识别层

AccessKey 支持以下三种常见的 API 认证 Header，确保兼容所有主流编程工具：

| Header | 格式 | 适用工具 |
|--------|------|----------|
| `Authorization` | `Bearer sk_xxxx...` | Claude Code、OpenAI 兼容客户端、通用 HTTP 客户端 |
| `x-api-key` | `sk_xxxx...` | Anthropic 官方 SDK、部分 OpenAI 兼容客户端 |
| `x-goog-api-key` | `sk_xxxx...` | Gemini 兼容客户端、Google AI Studio 接入 |

**认证流程**：按以下优先级依次尝试提取 Key——`Authorization: Bearer` → `x-api-key` → `x-goog-api-key`，取第一个非空值。

在现有代理请求处理流程中增加 `sk_` Key 识别：

```
请求进入代理
    │
    ├── 1. 提取 API Key
    │     从 Authorization / x-api-key / x-goog-api-key 中提取
    │
    ├── 2. Key 前缀判断
    │     ├── sk_ → 查找 AccessKey → 走「接入密钥」流程
    │     ├── (其他) → 走现有流程（全局 apiKey 校验）
    │
    └── 3. 后续处理
```

> **设计要点**：`sk_` Key 和现有的全局 `apiKey` 认证**并行工作**，互不干扰。管理员自己仍然可以通过全局 apiKey 使用代理，不受影响。

#### F4.2 接入密钥请求处理流程

当识别到 `sk_` Key 时：

```
sk_ Key 请求进入
    │
    ├── 1. Key 状态检查
    │     status === 'active' ? 继续 : 返回 403
    │
    ├── 2. 策略查询
    │     通过 key.policyId 获取 Policy
    │     无策略 → 返回 403（未配置策略）
    │
    ├── 3. 配额检查
    │     ├── Token 日/周/月限额检查
    │     ├── 请求次数限额检查
    │     ├── RPM 检查（内存计数器）
    │     └── 并发检查（内存计数器）
    │     通过 ? 继续 : 返回 429 + 剩余配额信息
    │
    ├── 4. 模型过滤
    │     allowedModels / blockedModels 检查
    │     通过 ? 继续 : 返回 403
    │
    ├── 5. 路由解析
    │     从 policy.routeId 获取 Route
    │     → 走现有的规则匹配、内容类型检测流程
    │
    ├── 6. 请求转发
    │     复用现有的格式转换、上游转发逻辑
    │     注入 keyId 到请求上下文
    │
    └── 7. 后处理
          ├── ⛔ 跳过现有日志系统写入（不写入 logs/ 目录）
          ├── ⛔ 跳过现有统计系统更新（不计入 statistics.json）
          ├── ✅ Token 回写：将本次消耗的 Token 累加到该 Key 的统计中
          ├── ✅ 日志记录：写入该 Key 的独立日志空间（key-logs/{keyId}/）
          ├── ✅ 并发计数器递减
          └── ✅ 统计更新：更新该 Key 的请求统计（key-usage/{keyId}.json）
```

#### F4.3 配额检查实现要点

**RPM 检查**：
- 使用内存中的滑动窗口计数器（per Key）
- 窗口大小：60 秒
- 每次请求时检查当前窗口内的请求数是否超过 `rpmLimit`
- 进程重启后计数器归零（可接受的精度损失）

**并发检查**：
- 使用内存计数器（per Key）
- 请求开始时 +1，请求结束时 -1（无论成功失败）
- 超过 `concurrentLimit` 时立即返回 429

**Token 周期限额**：
- 持久化存储每个 Key 的周期 Token 消耗
- 按周期类型自动重置（日/周/月/自定义）
- Token 用量在请求完成后（拿到上游响应后）回写

**请求次数周期限额**：
- 持久化存储每个 Key 的周期请求计数
- 按周期类型自动重置
- 在请求通过所有检查后 +1

### 3.6 F5 — 配额告警

#### F5.1 告警规则

- 当 Key 的任一配额维度使用率达到阈值时产生告警：
  - **80%**：黄色警告
  - **95%**：橙色警告
  - **100%**：红色告警（已触发限制）
- 告警在 Key 管理页面以角标形式展示
- 告警列表页展示所有活跃告警

#### F5.2 告警通知（可选）

- 支持配置 Webhook URL
- 当告警触发时发送 POST 请求到 Webhook
- Webhook Payload：
  ```json
  {
    "event": "quota_warning",
    "keyId": "sk_abc123",
    "keyName": "张三 - 前端组",
    "policyName": "中度限制策略",
    "dimension": "dailyTokenLimit",
    "usage": 850000,
    "limit": 1000000,
    "percentage": 85,
    "timestamp": 1700000000000
  }
  ```

---

## 4. 数据模型

### 4.1 新增数据文件

在现有 `~/.aicodeswitch/fs-db/` 目录下新增以下数据文件：

```
fs-db/
├── access-keys.json        # AccessKey[] — 接入密钥列表
├── policies.json           # Policy[] — 策略列表
├── key-usage/              # Key 级用量统计
│   ├── {keyId}.json        # 单个 Key 的用量数据
│   └── ...
├── key-logs/               # Key 级日志
│   ├── {keyId}/
│   │   ├── logs-YYYY-MM-DD.json  # 日志分片（复用现有分片逻辑）
│   │   └── logs-index.json       # 日志索引
│   └── ...
├── ... (现有文件不变)
```

### 4.2 AccessKey 数据结构

```typescript
interface AccessKey {
  id: string;                  // 系统生成的唯一标识，如 "key_abc123"
  name: string;                // 名称，如 "张三 - 前端组"
  remark?: string;             // 备注信息
  apiKey: string;              // API Key（sk_ 前缀）
  apiKeyHash: string;          // API Key 的哈希值（用于快速查找）
  policyId?: string;           // 绑定的策略 ID
  status: 'active' | 'disabled';  // 状态
  createdAt: number;           // 创建时间（Unix 时间戳）
  updatedAt: number;           // 更新时间
  lastActiveAt?: number;       // 最后活跃时间
}
```

### 4.3 Policy 数据结构

```typescript
interface Policy {
  id: string;                  // 系统生成的唯一标识
  name: string;                // 策略名称，如 "中度限制策略"
  description?: string;        // 策略描述

  // 路由绑定
  routeId?: string;            // 绑定的路由 ID

  // Token 配额（单位：千 Token）
  dailyTokenLimit?: number;           // 日 Token 限额（k）
  weeklyTokenLimit?: number;          // 周 Token 限额（k）
  monthlyTokenLimit?: number;         // 月 Token 限额（k）
  customTokenLimit?: number;          // 自定义周期 Token 限额（k）
  customTokenResetHours?: number;     // 自定义周期小时数

  // 请求次数配额
  dailyRequestLimit?: number;         // 日请求限额
  weeklyRequestLimit?: number;        // 周请求限额
  monthlyRequestLimit?: number;       // 月请求限额
  customRequestLimit?: number;        // 自定义周期请求限额
  customRequestResetHours?: number;   // 自定义周期小时数

  // 频率与并发
  rpmLimit?: number;                  // 每分钟请求数上限
  concurrentLimit?: number;           // 最大并发数

  // 模型过滤
  allowedModels?: string[];           // 模型白名单
  blockedModels?: string[];           // 模型黑名单

  createdAt: number;
  updatedAt: number;
}
```

### 4.4 KeyUsage 数据结构

每个 Key 一个独立的用量文件（`key-usage/{keyId}.json`）：

```typescript
interface KeyUsage {
  keyId: string;

  // 累计用量（全生命周期）
  lifetime: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalRequests: number;
    errorCount: number;
  };

  // 周期性用量（按维度分别跟踪）
  periods: {
    daily: {
      tokens: number;
      requests: number;
      periodStart: number;      // 当前周期的起始时间戳
    };
    weekly: {
      tokens: number;
      requests: number;
      periodStart: number;
    };
    monthly: {
      tokens: number;
      requests: number;
      periodStart: number;
    };
    custom?: {
      tokens: number;
      requests: number;
      periodStart: number;
      resetHours: number;
    };
  };

  // 历史趋势（按天汇总，保留 90 天）
  dailyHistory: Array<{
    date: string;               // "YYYY-MM-DD"
    tokens: number;
    requests: number;
    errors: number;
  }>;
}
```

### 4.5 与现有模型的关系

```
现有模型（保持不变）              新增模型
──────────────────              ────────
Vendor ─┬─ services[]           AccessKey ──▶ Policy ──▶ Route
        │                          │
Route ──┼─ rules[]                 ├── 独立统计 (KeyUsage)
        │                          └── 独立日志 (KeyLogs)
Rule ───┤
        │                       Policy 配额检查 → 现有 Rule 匹配流程不变
Config ─┘
```

**核心关系**：
- `AccessKey.policyId` → `Policy.id`
- `Policy.routeId` → `Route.id`
- 请求通过 `sk_` Key → 查到 Policy → 查到 Route → 走现有 Rule 匹配流程
- **现有 Vendor、Route、Rule、Service 等模型完全不变**

---

## 5. API 设计

### 5.1 接入密钥 API

```
GET    /api/access-keys                    # 密钥列表（分页、筛选）
  Query:    ?page=1&pageSize=20&status=active&policyId=p01&search=张三
  Response: { data: AccessKey[], total, page, pageSize }

POST   /api/access-keys                    # 创建密钥
  Request:  { name, remark?, policyId? }
  Response: { key: AccessKey, apiKey: "sk_xxxx..." }  # 仅此时返回完整 apiKey

GET    /api/access-keys/:id                # 密钥详情
  Response: AccessKey (apiKey 为掩码)

PUT    /api/access-keys/:id                # 编辑密钥
  Request:  { name?, remark?, policyId?, status? }

DELETE /api/access-keys/:id                # 删除密钥

POST   /api/access-keys/:id/regenerate     # 重新生成 API Key
  Response: { apiKey: "sk_xxxx..." }

PUT    /api/access-keys/batch/status       # 批量启用/停用
  Request:  { keyIds: string[], status: 'active' | 'disabled' }

PUT    /api/access-keys/batch/policy       # 批量绑定策略
  Request:  { keyIds: string[], policyId: string }

DELETE /api/access-keys/batch              # 批量删除
  Request:  { keyIds: string[] }
```

### 5.2 策略 API

```
GET    /api/policies                       # 策略列表
  Response: Policy[]

POST   /api/policies                       # 创建策略
  Request:  Policy (不含 id, createdAt, updatedAt)

GET    /api/policies/:id                   # 策略详情
  Response: Policy

PUT    /api/policies/:id                   # 编辑策略
  Request:  Policy (部分字段)

DELETE /api/policies/:id                   # 删除策略（检查关联 Key）

POST   /api/policies/:id/duplicate        # 复制策略
  Response: Policy (新的策略)

GET    /api/policies/:id/keys              # 使用该策略的密钥列表
  Response: AccessKey[]

GET    /api/policies/:id/preview           # 预览策略完整配置
  Response: { policy, route, rules[], keyCount }
```

### 5.3 Key 级统计 API

```
GET    /api/access-keys/:id/usage          # Key 用量统计
  Response: KeyUsage

GET    /api/access-keys/:id/usage/trend    # Key 用量趋势
  Query:    ?days=30
  Response: Array<{ date, tokens, requests, errors }>

GET    /api/access-keys/:id/sessions       # Key 下的会话列表
  Query:    ?page=1&pageSize=20
  Response: { data: Session[], total }
```

### 5.4 Key 级日志 API

```
GET    /api/access-keys/:id/logs           # Key 的请求日志
  Query:    ?page=1&pageSize=50&startDate=&endDate=
  Response: { data: RequestLog[], total }

GET    /api/access-keys/:id/error-logs     # Key 的错误日志
  Query:    ?page=1&pageSize=50
  Response: { data: ErrorLog[], total }
```

### 5.5 全局统计增强 API

```
GET    /api/statistics/access-keys         # Key 用量排行
  Query:    ?sortBy=totalTokens&order=desc&limit=20
  Response: Array<{ keyId, keyName, totalTokens, totalRequests, lastActiveAt }>

GET    /api/statistics/quota-alerts        # 配额告警列表
  Response: Array<{ keyId, keyName, dimension, usage, limit, percentage }>
```

### 5.6 接入指引 API

```
GET    /api/access-keys/:id/guide          # 获取接入指引信息
  Query:    ?host=192.168.1.100&port=4567
  Response: {
    claudeCode: { envVars, configSnippet },
    codex: { configSnippet },
    openai: { envVars }
  }
```

---

## 6. 代理请求处理流程

### 6.1 完整流程图

```
客户端请求 → Express 中间件
    │
    ├── 路径判断
    │   ├── /v1/*, /claude-code/*, /codex/* → 进入代理处理
    │   └── /api/* → 进入管理 API 处理
    │
    ├── 提取 API Key（支持三种 Header，按优先级依次尝试）
    │   ├── Authorization: Bearer sk_xxx（Claude Code、OpenAI 兼容客户端）
    │   ├── x-api-key: sk_xxx（Anthropic SDK、部分兼容客户端）
    │   └── x-goog-api-key: sk_xxx（Gemini 兼容客户端）
    │
    ├── Key 类型判断
    │   ├── 以 sk_ 开头 → 【接入密钥流程】
    │   └── 其他 → 【现有流程：全局 apiKey 校验】
    │
    └── 接入密钥流程
        ├── 1. 查找 AccessKey（通过 apiKeyHash 索引）
        │     未找到 → 401 INVALID_API_KEY
        │
        ├── 2. 状态检查
        │     status !== 'active' → 403 KEY_DISABLED
        │
        ├── 3. 策略查询
        │     无 policyId → 403 NO_POLICY_CONFIGURED
        │     策略不存在 → 403 POLICY_NOT_FOUND
        │
        ├── 4. 配额检查
        │   ├── 4a. Token 日/周/月限额检查
        │   │     超限 → 429 TOKEN_QUOTA_EXCEEDED
        │   ├── 4b. 请求次数限额检查
        │   │     超限 → 429 REQUEST_QUOTA_EXCEEDED
        │   ├── 4c. RPM 检查
        │   │     超限 → 429 RPM_LIMIT_EXCEEDED
        │   └── 4d. 并发检查
        │         超限 → 429 CONCURRENT_LIMIT_EXCEEDED
        │
        ├── 5. 模型过滤
        │     模型不在白名单或在黑名单 → 403 MODEL_NOT_ALLOWED
        │
        ├── 6. 路由解析
        │     policy.routeId → Route → 进入现有规则匹配流程
        │     无路由 → 403 NO_ROUTE_CONFIGURED
        │
        ├── 7. 规则匹配 + 请求转发
        │     【复用现有逻辑：内容类型检测 → 规则匹配 → 格式转换 → 上游转发】
        │     注入 keyId 到请求上下文
        │
        └── 8. 后处理（完全独立，不影响现有系统）
              ├── ⛔ 跳过现有日志系统写入
              ├── ⛔ 跳过现有统计系统更新
              ├── ✅ Token 回写到 KeyUsage
              ├── ✅ 日志写入 Key 独立日志空间
              ├── ✅ 请求计数更新
              ├── ✅ 并发计数器递减
              └── ✅ 统计更新
```

### 6.2 错误响应格式

所有接入密钥相关的错误响应遵循统一格式：

```json
{
  "error": {
    "type": "authentication_error" | "permission_error" | "rate_limit_error",
    "code": "INVALID_API_KEY",
    "message": "人类可读的错误描述"
  }
}
```

**错误码一览**：

| HTTP | Code | 说明 |
|:----:|------|------|
| 401 | `INVALID_API_KEY` | API Key 无效或不存在 |
| 403 | `KEY_DISABLED` | 密钥已停用 |
| 403 | `NO_POLICY_CONFIGURED` | 密钥未配置策略 |
| 403 | `POLICY_NOT_FOUND` | 策略不存在（可能已被删除） |
| 403 | `NO_ROUTE_CONFIGURED` | 策略未绑定路由 |
| 403 | `MODEL_NOT_ALLOWED` | 请求的模型不在允许列表中 |
| 429 | `TOKEN_QUOTA_EXCEEDED` | Token 配额已耗尽 |
| 429 | `REQUEST_QUOTA_EXCEEDED` | 请求次数配额已耗尽 |
| 429 | `RPM_LIMIT_EXCEEDED` | 频率限制触发 |
| 429 | `CONCURRENT_LIMIT_EXCEEDED` | 并发限制触发 |

### 6.3 响应头

接入密钥请求的响应中附加以下 Header，帮助客户端了解配额状态：

```
X-RateLimit-Limit: 1000              # 周期内请求上限
X-RateLimit-Remaining: 842           # 周期内剩余请求数
X-RateLimit-Reset: 1700000000        # 周期重置时间（Unix 时间戳）
X-Token-Quota-Remaining: 3200000     # 当前周期剩余 Token
```

> 这些 Header 是可选的。只有在策略配置了对应限额时才返回。

---

## 7. UI 设计

### 7.1 导航结构

在现有侧边栏中新增两个入口：

```
侧边栏
├── 供应商 (Vendors)          ← 现有
├── 路由 (Routes)             ← 现有
├── MCP                       ← 现有
├── Skills                    ← 现有
├── ─────────────────────
├── 接入密钥 (Access Keys)    ← 新增 🆕
├── 策略 (Policies)           ← 新增 🆕
├── ─────────────────────
├── 日志 (Logs)               ← 现有，增加按 Key 筛选
├── 用量 (Usage)              ← 现有，增加 Key 维度
├── ─────────────────────
├── 设置 (Settings)           ← 现有
└── 写入配置 (Write Config)   ← 现有
```

### 7.2 接入密钥页面（Access Keys Page）

#### 列表视图

```
┌────────────────────────────────────────────────────────────────┐
│  接入密钥                              [+ 创建密钥] [批量操作 ▼] │
├────────────────────────────────────────────────────────────────┤
│  筛选: [全部状态 ▼] [全部策略 ▼] [搜索名称或备注...        🔍]  │
├──────┬────────────┬──────────┬──────┬────────┬────────┬───────┤
│  名称 │  API Key   │  策略    │ 状态 │ Token  │ 请求数  │ 操作  │
├──────┼────────────┼──────────┼──────┼────────┼────────┼───────┤
│ 张三 │ sk_****3a │ 中度限制 │ 🟢   │ 156k/  │ 89/    │ ···  │
│      │            │          │      │ 200k   │ 200    │      │
├──────┼────────────┼──────────┼──────┼────────┼────────┼───────┤
│ 李四 │ sk_****7b │ VIP策略  │ 🟢   │ 1.2M/  │ 456    │ ···  │
│      │            │          │      │ 不限   │ 不限   │      │
├──────┼────────────┼──────────┼──────┼────────┼────────┼───────┤
│ 测试 │ sk_****2c │ 未配置   │ ⚫   │ -      │ -      │ ···  │
├──────┴────────────┴──────────┴──────┴────────┴────────┴───────┤
│                     < 1  2  3  >  共 45 个密钥                  │
└────────────────────────────────────────────────────────────────┘
```

#### 创建密钥弹窗

```
┌─────────────────────────────────────────┐
│  创建接入密钥                      ✕     │
├─────────────────────────────────────────┤
│                                         │
│  名称 *                                 │
│  ┌─────────────────────────────────┐    │
│  │ 例如：张三 - 前端组              │    │
│  └─────────────────────────────────┘    │
│                                         │
│  备注                                   │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  策略                                   │
│  ┌─────────────────────────┐ [管理策略] │
│  │ 选择已有策略...          ▼         │    │
│  └─────────────────────────────────┘    │
│  ☐ 稍后配置                             │
│                                         │
│           [取消]    [创建]               │
└─────────────────────────────────────────┘
```

#### 创建成功弹窗（展示 Key）

```
┌─────────────────────────────────────────┐
│  ✅ 密钥创建成功                   ✕     │
├─────────────────────────────────────────┤
│                                         │
│  请立即复制并保存此 API Key。            │
│  关闭此窗口后将无法再次查看完整 Key。     │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ sk_a1b2c3d4e5f6g7h8i9j0k1l2   │ 📋│
│  └─────────────────────────────────┘    │
│                                         │
│  接入指引：                              │
│  Claude Code:                           │
│    ANTHROPIC_BASE_URL=http://...        │
│    ANTHROPIC_AUTH_TOKEN=sk_xxxx        │
│                                         │
│           [已复制]    [完成]              │
└─────────────────────────────────────────┘
```

### 7.3 策略页面（Policies Page）

#### 策略列表

```
┌─────────────────────────────────────────────────────────────────┐
│  策略管理                                [+ 创建策略]            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  📋 不限策略                                    [编辑] [···]│   │
│  │  不限制任何用量，适合信任用户                              │   │
│  │  路由: 主路由  |  Key 数: 3  |  配额: 无限制               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  📋 中度限制策略                                [编辑] [···]│   │
│  │  适合普通开发者使用                                        │   │
│  │  路由: 主路由  |  Key 数: 5  |  配额: 日200k/月2000k       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  📋 VIP 策略                                   [编辑] [···]│   │
│  │  高配额策略，适合核心团队                                  │   │
│  │  路由: VIP路由  |  Key 数: 2  |  配额: 月10000k, RPM 30    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

#### 创建/编辑策略页面

```
┌─────────────────────────────────────────────────────────────────┐
│  创建策略                                                 [保存] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  基本信息                                                        │
│  ┌───────────────────────────┐  ┌───────────────────────────┐   │
│  │ 策略名称                   │  │ 描述（可选）               │   │
│  │ 中度限制策略               │  │ 适合普通开发者使用         │   │
│  └───────────────────────────┘  └───────────────────────────┘   │
│                                                                 │
│  路由绑定                                                        │
│  ┌───────────────────────────────────────────┐                  │
│  │ 选择路由...                                ▼│                  │
│  └───────────────────────────────────────────┘                  │
│                                                                 │
│  配额限制                      [使用模板 ▼]                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │  Token 限额（单位：千 Token）                             │    │
│  │  日限额: [     ] k     周限额: [     ] k                  │    │
│  │  月限额: [ 2000] k     自定义: [     ] k / [  ] 小时      │    │
│  │                                                         │    │
│  │  请求次数限额                                             │    │
│  │  日限额: [  200]        周限额: [     ]                   │    │
│  │  月限额: [     ]        自定义: [     ] / [  ] 小时       │    │
│  │                                                         │    │
│  │  频率限制                                                │    │
│  │  RPM: [  10] 请求/分钟   并发: [   3] 最大请求数          │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  模型过滤                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  ☐ 启用模型过滤                                          │    │
│  │                                                         │    │
│  │  白名单模式 ○  黑名单模式 ○                               │    │
│  │  ┌───────────────────────────────────────────────────┐  │    │
│  │  │ claude-sonnet-4-20250514          ✕               │  │    │
│  │  │ claude-opus-4-20250514            ✕               │  │    │
│  │  │ + 添加模型                                         │  │    │
│  │  └───────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.4 Key 详情页（统计 + 日志）

点击某个 Key 后进入详情页：

```
┌─────────────────────────────────────────────────────────────────┐
│  ← 返回    张三 - 前端组                      [编辑] [停用]      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  基本信息                                                        │
│  API Key: sk_****3a2d  [显示完整] [重新生成]                     │
│  策略: 中度限制策略  [切换]                                       │
│  状态: 🟢 启用    最后活跃: 3 分钟前                              │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ 累计Token │ │ 今日Token │ │ 今日请求  │ │  成功率   │           │
│  │  1.56M   │ │ 156k/200k│ │  89/200  │ │  98.2%   │           │
│  │          │ │ ████████░ │ │ █████░░░ │ │          │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                 │
│  配额使用情况                                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  日Token:  156k / 200k  ████████░░░░  78%               │    │
│  │  月Token:  1.56M / 2000k █████░░░░░░  78%               │    │
│  │  RPM:      3 / 10  (当前分钟)                            │    │
│  │  并发:     1 / 3  (当前)                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Token 消耗趋势 (最近 30 天)                     [按天 ▼]        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    📊 折线图区域                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  最近请求                                     [查看全部日志 →]    │
│  ┌──────┬────────────┬────────┬────────┬───────┬─────────────┐  │
│  │ 时间 │  模型       │  Token │ 耗时   │ 状态  │ 内容类型    │  │
│  ├──────┼────────────┼────────┼────────┼───────┼─────────────┤  │
│  │ 10:32│ sonnet-4   │ 2,450  │ 3.2s   │ ✅   │ default     │  │
│  │ 10:30│ sonnet-4   │ 8,120  │ 12.5s  │ ✅   │ thinking    │  │
│  │ 10:28│ sonnet-4   │ 1,200  │ 1.1s   │ ✅   │ default     │  │
│  └──────┴────────────┴────────┴────────┴───────┴─────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. 技术方案

### 8.1 架构原则

```
┌─────────────────────────────────────────────────────────────────┐
│                        设计原则                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 最小侵入：接入密钥模块作为现有系统的「插件层」                   │
│     - 现有代理引擎代码尽量不修改                                  │
│     - 在请求入口处增加 sk_ Key 判断分支                          │
│     - 现有全局 apiKey 认证路径完全不受影响                         │
│                                                                 │
│  2. 复用优先：最大程度复用现有能力                                 │
│     - 复用规则匹配、内容类型检测、格式转换                         │
│     - 复用日志分片和索引机制                                      │
│     - 复用统计逻辑                                               │
│                                                                 │
│  3. 独立存储：接入密钥的数据独立存储                               │
│     - 新增 JSON 文件存储 Key、Policy、Usage                       │
│     - Key 级日志复用现有分片逻辑，独立目录                         │
│     - 不与现有数据文件耦合                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 新增文件清单

```
src/
├── server/
│   ├── access-keys/                      # 接入密钥模块
│   │   ├── manager.ts                    # AccessKey CRUD + 策略绑定
│   │   ├── policy-manager.ts             # Policy CRUD
│   │   ├── quota-checker.ts              # 配额检查（Token/请求/RPM/并发）
│   │   ├── usage-tracker.ts              # 用量追踪与持久化
│   │   ├── key-logger.ts                 # Key 级日志管理
│   │   └── key-resolver.ts              # sk_ Key 解析与认证
│   └── proxy-server.ts                   # 修改：增加 sk_ Key 分支
├── ui/
│   ├── pages/
│   │   ├── AccessKeysPage.tsx            # 接入密钥管理页面
│   │   ├── AccessKeyDetailPage.tsx       # 密钥详情页面
│   │   ├── PolicyPage.tsx               # 策略管理页面
│   │   └── PolicyEditPage.tsx           # 策略编辑页面
│   └── components/
│       ├── AccessKeyCard.tsx             # 密钥卡片组件
│       ├── PolicyCard.tsx               # 策略卡片组件
│       ├── QuotaConfig.tsx              # 配额配置组件
│       ├── QuotaBar.tsx                 # 配额进度条组件
│       ├── KeyGuideModal.tsx            # 接入指引弹窗
│       └── KeyCreateResultModal.tsx     # 创建成功弹窗
└── types/
    └── access-keys.ts                   # AccessKey / Policy 类型定义
```

### 8.3 proxy-server.ts 改造点

**改造范围最小化**，仅在以下位置增加分支逻辑：

1. **API Key 提取后**（约 L670-L682 位置）：
   - 检测 `sk_` 前缀
   - 走 `keyResolver.resolve(apiKey)` 获取 AccessKey + Policy
   - 将解析结果注入请求上下文

2. **路由查找**（`findMatchingRoute` 附近）：
   - 如果上下文中有 AccessKey 解析结果
   - 从 `policy.routeId` 获取 Route，替代全局 toolBindings

3. **规则匹配后**（`findMatchingRule` 附近）：
   - 增加模型过滤检查（policy.allowedModels / blockedModels）

4. **请求完成后**（日志记录和统计更新处）：
   - 如果有 keyId，**跳过**现有日志系统和统计系统的写入（不写 `logs/`、不更新 `statistics.json`、不更新 session 等）
   - 将日志写入 Key 独立日志空间（`key-logs/{keyId}/`）
   - 将 Token 用量回写到 KeyUsage（`key-usage/{keyId}.json`）

### 8.4 配额检查实现方案

```
┌──────────────────────────────────────────────────────────┐
│                  QuotaChecker                            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  持久化配额 (key-usage/{keyId}.json)                      │
│  ├── Token 日/周/月/自定义周期用量                         │
│  ├── 请求次数日/周/月/自定义周期用量                       │
│  └── 周期起始时间 + 自动重置检测                           │
│                                                          │
│  内存配额 (QuotaChecker 实例属性)                         │
│  ├── rpmTracker: Map<keyId, SlidingWindowCounter>        │
│  │   └── 60 秒滑动窗口，per Key                          │
│  └── concurrentTracker: Map<keyId, number>               │
│      ├── 请求开始 +1，请求结束 -1                         │
│      └── 通过 try/finally 保证递减                       │
│                                                          │
│  检查顺序:                                               │
│  1. Token 周期限额 (持久化读取)                           │
│  2. 请求次数限额 (持久化读取)                             │
│  3. RPM (内存)                                           │
│  4. 并发 (内存)                                          │
│                                                          │
│  写入顺序 (请求完成后):                                   │
│  1. 并发 -1                                              │
│  2. Token 回写 (异步持久化)                               │
│  3. 请求计数 +1 (异步持久化)                              │
│  4. RPM 计数 (内存)                                      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 8.5 Key 级日志方案

复用现有的日志分片机制（`logs-YYYY-MM-DD.json` + `logs-index.json`），但每个 Key 有独立目录：

```
key-logs/
├── {keyId}/
│   ├── logs-2026-06-09-001.json     # 日志分片（复用现有分片逻辑）
│   ├── logs-2026-06-09-002.json
│   ├── logs-index.json              # 分片索引
│   └── session-log-index.json       # 会话索引
└── ...
```

**内存中的 Key→日志 映射**：使用 Map 缓存活跃 Key 的日志写入器，定期 flush。

### 8.6 API Key Hash 索引

为了高效查找 `sk_` Key 对应的 AccessKey 记录：

- 生成 Key 时同时生成 `apiKeyHash`（SHA-256 的前 16 字符）
- 在内存中维护 `Map<apiKeyHash, AccessKey>` 索引
- 启动时从 `access-keys.json` 重建索引
- 内存查找 < 1ms

---

## 9. 非功能需求

### 9.1 性能

| 指标 | 目标 |
|------|------|
| sk_ Key 解析增加延迟 | < 2ms |
| 配额检查增加延迟 | < 3ms（内存索引 + 内存计数器） |
| 日志写入增加延迟 | < 1ms（异步写入，不阻塞请求） |
| 支持 AccessKey 数量 | ≥ 500 |
| 并发请求（跨所有 Key） | ≥ 50 |

### 9.2 安全

| 要求 | 措施 |
|------|------|
| API Key 存储 | `access-keys.json` 中存储完整 Key（单机场景，与现有 apiKey 存储方式一致） |
| Key 传输 | 建议生产环境通过反向代理提供 HTTPS |
| Key 展示 | 创建后仅展示一次完整 Key，列表页掩码展示 |
| Key 重新生成 | 旧 Key 立即失效 |
| 管理接口保护 | 复用现有 AUTH 密码认证 |

### 9.3 数据可靠性

| 要求 | 措施 |
|------|------|
| 用量数据持久化 | KeyUsage 文件每次请求后异步写入，带 debounce（5 秒间隔批量写入） |
| 日志数据可靠 | 复用现有日志分片 + flush 机制 |
| 进程崩溃恢复 | RPM / 并发计数器为内存态，重启归零（可接受的精度损失）；Token / 请求计数从文件恢复 |
| 日志保留 | 遵循现有 30 天保留策略，每个 Key 独立清理 |

---

## 10. 与现有系统的兼容

### 10.1 运行模式

**接入密钥功能作为可选模块，不影响现有使用方式**：

```
AICodeSwitch 启动
    │
    ├── access-keys.json 存在？
    │   ├── 是 → 加载接入密钥索引，启用 sk_ Key 识别
    │   └── 否 → 跳过，不影响现有功能
    │
    └── 请求进入
        ├── sk_ Key → 接入密钥流程
        └── 其他 Key → 现有流程（全局 apiKey 校验）
```

**核心保证**：
- 未创建任何 AccessKey 时，系统行为与现在完全一致
- 管理员自己的全局 apiKey 不受影响
- 现有路由、规则、供应商配置不受影响
- 不需要新的环境变量或配置项

### 10.2 数据文件兼容

| 文件 | 变化 | 兼容性 |
|------|------|--------|
| `access-keys.json` | 新增 | 不存在时自动创建空数组 |
| `policies.json` | 新增 | 不存在时自动创建空数组 |
| `key-usage/` | 新增目录 | 按需创建 |
| `key-logs/` | 新增目录 | 按需创建 |
| 其他现有文件 | **不修改** | 完全兼容 |

### 10.3 代理路径兼容

接入密钥的请求使用**完全相同的 API 路径**：

| 路径 | 认证方式 | 说明 |
|------|----------|------|
| `/v1/messages` | `Bearer sk_xxx` | Claude 格式，走接入密钥 |
| `/v1/messages` | `Bearer {globalKey}` | Claude 格式，走现有流程 |
| `/v1/chat/completions` | `Bearer sk_xxx` | OpenAI 格式，走接入密钥 |
| `/v1/chat/completions` | `Bearer {globalKey}` | OpenAI 格式，走现有流程 |
| `/claude-code/*` | `Bearer sk_xxx` | Claude Code 代理，走接入密钥 |
| `/codex/*` | `Bearer sk_xxx` | Codex 代理，走接入密钥 |

---

## 11. 分期交付计划

### Phase 1：核心功能（MVP）

> 目标：可以创建 Key、绑定策略，接入方能通过 Key 使用代理

**功能范围**：

- [ ] AccessKey 数据模型 + CRUD API
- [ ] Policy 数据模型 + CRUD API（基础配额：Token 日/月限额 + 请求次数限额）
- [ ] 代理引擎 `sk_` Key 识别和策略路由
- [ ] 基础配额检查（Token 周期限额 + 请求次数限额）
- [ ] Key 级日志记录（日志中关联 keyId）
- [ ] Key 级基础统计（Token 累计、请求计数）
- [ ] UI：接入密钥列表页 + 创建/编辑弹窗
- [ ] UI：策略列表页 + 创建/编辑页
- [ ] 接入指引弹窗

**预计工期**：1.5-2 周

### Phase 2：管控增强

> 目标：完善配额、统计、日志能力

**功能范围**：

- [ ] 高级配额：RPM 限制、并发限制、模型过滤
- [ ] 自定义周期配额
- [ ] 策略模板
- [ ] Key 级独立日志空间（按 Key 隔离的日志目录）
- [ ] Key 详情页（配额进度条、趋势图、最近请求）
- [ ] 全局统计增强（Key 排行、配额告警）
- [ ] 批量操作（批量绑定策略、批量停用/启用）
- [ ] 策略复制

**预计工期**：1-1.5 周

### Phase 3：体验优化（可选）

> 目标：提升管理体验和运维能力

**功能范围**：

- [ ] Key 分组/标签（方便管理大量 Key）
- [ ] 配额告警通知（Webhook）
- [ ] Key 级日志导出
- [ ] 批量创建 Key
- [ ] 自定义策略模板保存
- [ ] Key 过期时间（可选的自动停用）

**预计工期**：1 周

---

## 12. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|:----:|----------|
| JSON 文件并发写入冲突 | Key 多时用量更新频繁 | 低 | 使用 debounce + 排队写入，避免同时写同一个文件 |
| 内存计数器丢失 | 进程重启后 RPM / 并发数据丢失 | 确定 | 可接受的精度损失；Token / 请求计数持久化 |
| Key 级日志占用磁盘 | 大量 Key 产生大量日志文件 | 低 | 复用现有 30 天清理策略；每个 Key 独立清理 |
| 代理引擎改动引入 bug | 影响现有功能 | 低 | sk_ 分支与现有流程完全隔离；充分测试两种路径 |
| 策略修改实时生效 | 修改策略影响正在进行的请求 | 低 | 策略修改在下一次请求时生效；进行中的请求不受影响 |
| Key 泄露 | 被未授权方使用 | 中 | 支持即时停用和重新生成；配额限制可缓解滥用 |

---

## 附录

### A. API Key 前缀约定

| 前缀 | 用途 | 来源 |
|------|------|------|
| `sk_` | 接入密钥 AccessKey（本方案） | 系统自动生成 |
| `skr_` | 路由 Key（现有） | 系统自动生成 |

### B. 错误码速查

| HTTP | Code | 含义 |
|:----:|------|------|
| 401 | `INVALID_API_KEY` | 无效的 API Key |
| 403 | `KEY_DISABLED` | 密钥已停用 |
| 403 | `NO_POLICY_CONFIGURED` | 未绑定策略 |
| 403 | `POLICY_NOT_FOUND` | 策略已删除 |
| 403 | `NO_ROUTE_CONFIGURED` | 策略未绑定路由 |
| 403 | `MODEL_NOT_ALLOWED` | 模型不在允许列表 |
| 429 | `TOKEN_QUOTA_EXCEEDED` | Token 配额超限 |
| 429 | `REQUEST_QUOTA_EXCEEDED` | 请求次数超限 |
| 429 | `RPM_LIMIT_EXCEEDED` | 频率超限 |
| 429 | `CONCURRENT_LIMIT_EXCEEDED` | 并发超限 |

### C. 术语表

| 术语 | 说明 |
|------|------|
| AccessKey（接入密钥） | 系统生成的 API Key，作为接入方的唯一身份凭证 |
| Policy（策略） | 可复用的配置模板，包含路由绑定 + 配额限制 + 模型过滤 |
| KeyUsage（密钥用量） | 每个密钥的独立统计空间 |
| RPM | Requests Per Minute，每分钟请求数 |
| Quota（配额） | 对接入方使用量的多维限制 |
