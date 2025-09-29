# 多 Agent PRD：多 Agent 前后端解耦设计
# 文件名：doc/prd/multi-agent-prd.md
# 创建者: GPT-5 Mini
# 创建日期: 2025-09-29

## 背景与目标

目标：
- 支持多个相互独立的 AGENT（例如：`circuit-agent`、`circuit-fine-agent`），前端通过静态标签页区分，不共享运行时内部逻辑或提示词。
- 允许共享全局配置（API Key、模型选择等），但会话、历史、日志、提示词与后端服务都必须隔离。
- 每个 AGENT 由独立后端服务提供，前端通过可配置的 base URL 与 REST 接口交互，保持前后端解耦。


## 需求细化

- UI：
  - 在 `App.tsx` 中增加静态标签：`Circuit (Direct)`, `Circuit (Fine)`（或使用短 id：`circuit`、`circuit-fine`）。
  - 每个标签下使用独立 Agent 组件（例如：`frontend/src/agents/circuit/` 与 `frontend/src/agents/circuit-fine/`），组件应实现统一的 `AgentComponent` 接口。
  - 全局共享设置区域（API Key、模型选择）保留在 `App.tsx`，但 Agent 组件仅读取这些设置并在请求中传递，不在本地修改共享 prompt 或 agent 内部配置。
  - 每个 Agent 在界面上必须有独立的：会话加载/保存、步骤历史（timeline）、错误/日志展示、overlay 与 enrichedJson 显示区域。

- 前端实现：
  - 新增类型定义：`frontend/src/types/agent.ts`，定义 `AgentDescriptor`、`AgentComponentProps`、`AgentSession` 等。
  - `App.tsx` 保持 tabs，但内部使用静态注册的 Agent 列表（每个条目包含 id、label、component）。
  - 移动 `ReviewForm` 到 `agents/circuit/ReviewForm.tsx` 并复制为 `agents/circuit-fine/ReviewForm.tsx`（初始两份实现相同，后续可独立修改）。
  - 每个 Agent 使用自己命名的 API base path（例如：`/api/v1/circuit-agent` 与 `/api/v1/circuit-fine-agent`）。`ReviewForm` 内不再硬编码后端子路径（如 `/orchestrate/review`），而使用 agent 描述中传入的 `baseUrl`。
  - 会话保存/加载接口改为按 agent 前缀：`/api/v1/{agentId}/sessions/...`。
  - 前端本地 session 列表与保存使用 key 名称空间隔离（例如 `savedSessions.{agentId}`）。

- 后端实现（高层）：
  - 每个 Agent 提供一套完整 REST API（示例）：
    - POST /api/v1/{agentId}/orchestrate/review    -- 提交评审请求
    - GET  /api/v1/{agentId}/sessions/list?limit=N  -- 列表会话
    - GET  /api/v1/{agentId}/sessions/{id}         -- 读取会话
    - POST /api/v1/{agentId}/sessions/save         -- 保存会话
    - DELETE /api/v1/{agentId}/sessions/{id}      -- 删除会话
    - GET  /api/v1/{agentId}/system-prompt?lang=zh -- 获取 agent 专属系统提示词
    - GET  /api/v1/{agentId}/progress/{progressId}-- 查询进度 timeline
  - 每个 agent 在自身服务目录下保存独立提示词（例如：`services/{agent-service}/prompts/*`），修改一个 agent 的 prompt 不会影响其它 agent。
  - 后端服务需要提供 API 文档（OpenAPI/Swagger 格式）并放置在 `doc/prd/agent-api-specs.md`（同时建议在各服务 `README.md` 中包含最小说明）。

- 数据与存储：
  - 会话文件与 artifact 在后端存储应以 agentId 为命名空间（例如：`storage/{agentId}/sessions/`）。
  - 日志与 artifacts 目录同样按 agent 隔离。


## 前端 Agent 接口（类型草案）

- `AgentDescriptor`:
  - id: string (例如 `circuit`)
  - label: string
  - baseUrl: string (例如 `/api/v1/circuit-agent`)
  - component: React.ComponentType<AgentComponentProps>

- `AgentComponentProps`:
  - baseUrl: string
  - apiKey: string
  - model: string
  - customModelName?: string
  - allowedApiUrls: string[]
  - onSavePair?: (api:string, model:string)=>void
  - sessionSeed?: AgentSession
  - onGlobalResult?: (agentId:string, markdown:string)=>void  // 可选的跨 agent 回调仅用于 UI 汇总，不涉及 agent 内部状态

- `AgentSession`:
  - version: number
  - agentId: string
  - apiUrl: string
  - model: string
  - markdown: string
  - enrichedJson?: any
  - overlay?: any
  - timeline?: any[]
  - files?: { name,type,size,lastModified,dataBase64 }[]


## 迁移步骤（建议）

1. 创建 `doc/prd/multi-agent-prd.md`（已完成）。
2. 在前端新增 `src/types/agent.ts` 并导出上述类型。
3. 在 `App.tsx` 中引入静态 Agent 描述并渲染对应组件（迁移现有 `ReviewForm` 为 `agents/circuit`）。
4. 复制并创建 `agents/circuit-fine`，保持代码独立。
5. 将 `ReviewForm` 中的后端路径改为使用 `props.baseUrl` 且 session 接口按 agent 命名空间调用。
6. 后端：为 `circuit-fine-agent` 创建独立服务（可以参考现有 `services/circuit-agent` 目录结构），并保证 prompts/ storage/ artifacts 独立。
7. 编写并放置 API 文档 `doc/prd/agent-api-specs.md`（针对每个 agent 列出 REST 路径与请求/响应示例）。
8. 更新 `CURSOR.md` 记录变更并说明运行/调试步骤。


## 验收条件

- 前端 UI 中两个静态标签各自独立，切换标签不会改变另一个的会话、timeline、输入或文件。
- 修改任一 agent 的 prompts 或后端实现，不会影响另一个 agent 的输出或行为。
- 会话保存/加载仅影响当前 agent 命名空间。
- 每个 agent 的后端应提供 OpenAPI 风格的 API 文档并放入 `doc/prd/agent-api-specs.md`。


## 后续建议

- 提供运行时可注册 agent 的配置文件（例如 `frontend/agents.json`），以支持未来动态加载。
- 实现 `PromptRepositoryFs`，由每个 agent 的后端从 `prompts/` 目录读取 prompts，便于版本化。


# 变更记录

- 2025-09-29: 初始草案，由 GPT-5 Mini 编写。
