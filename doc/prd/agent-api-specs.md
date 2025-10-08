# Agent API 规范（草案）
# 文件：doc/prd/agent-api-specs.md
# 说明：针对每个 agent，后端服务应暴露以下统一 REST 接口。agent 的 base path 形如 `/api/v1/{agent-service}`，如 `/api/v1/circuit-agent` 或 `/api/v1/circuit-fine-agent`。

## 公共接口一览

- POST  {base}/orchestrate/review
- GET   {base}/sessions/list?limit={n}
- GET   {base}/sessions/{id}
- POST  {base}/sessions/save
- DELETE{base}/sessions/{id}
- GET   {base}/system-prompt?lang={zh|en}
- GET   {base}/progress/{progressId}

---

## 1) POST {base}/orchestrate/review

用途：提交评审请求并触发 agent 的处理流程（可能包括视觉识别、多轮识别、检索、LLM 分析等）。

请求（multipart/form-data）：
- progressId (string, optional): 前端生成的 progress id，用于实时轮询。
- files (file[], optional): 上传的图像或 pdf。
- enrichedJson (string, optional): 预先生成的结构化 JSON（若存在，后端可复用避免视觉解析）。
- model (string): 使用的模型名称/别名。
- apiUrl (string): 外部模型的 API 地址（用于后端转发）。
- requirements (string): 用户提供的需求/场景文本。
- specs (string): 额外规格说明。
- directReview (string 'true'|'false'): 是否跳过视觉解析直接交给 LLM。
- systemPrompts (string, optional): JSON 字符串，包含 systemPrompt、requirements、specs 的合并信息（frontend 可能会发送）。
- history (string, optional): JSON 字符串的对话历史数组。
- dialog (string): 本轮用户输入的文本。
- multiPassRecognition (string 'true'|'false')
- recognitionPasses (string, optional)
- enableSearch (string 'true'|'false')
- searchTopN (string, optional)
- saveEnriched (string 'true'|'false')

响应（200 application/json）：
{
  "markdown": "...",
  "enrichedJson": { /* 可选 */ },
  "overlay": { /* 可选 */ },
  "timeline": [ { "step": "images_processing_start", "ts": 1234567890, "meta": {...} }, ... ],
  "warnings": ["..."],
  "progressId": "..."
}

错误：返回适当的 HTTP 状态码与文本/JSON 解释（例如 422 表示低置信但包含 enrichedJson）。

---

## 2) GET {base}/sessions/list?limit={n}

用途：列出最近的会话元信息（按 agent 命名空间隔离）。

响应（200 application/json）：
{
  "items": [ { "id": "...", "createdAt": "2025-09-29T...", "apiHost": "...", "model": "..." }, ... ]
}

---

## 3) GET {base}/sessions/{id}

用途：读取指定会话的完整内容（用于恢复 session 到前端）。

响应（200 application/json）：
{
  "version": 1,
  "apiUrl": "...",
  "model": "...",
  "customModelName": "...",
  "requirements": "...",
  "specs": "...",
  "questionConfirm": "...",
  "dialog": "...",
  "history": [ ... ],
  "timeline": [ ... ],
  "markdown": "...",
  "enrichedJson": {...},
  "overlay": {...},
  "files": [ { "name": "...", "type": "...", "size": 123, "dataBase64": "..." }, ... ]
}

---

## 4) POST {base}/sessions/save

用途：保存前端会话到后端持久化存储（按 agent 命名空间隔离）。

请求（application/json）：与 GET sessions/{id} 的响应结构相同，其中可能省略某些运行时字段。

响应（200 OK）: 简单成功消息或空体；失败返回合适状态与消息。

---

## 5) DELETE {base}/sessions/{id}

用途：删除会话。

响应（200 OK）或 404/4xx。

---

## 6) GET {base}/system-prompt?lang={zh|en}

用途：返回 agent 专属的 system prompt 文本（纯文本）以供前端在提交前合并。

响应（200 text/plain）: 返回提示词内容字符串。

---

## 7) GET {base}/progress/{progressId}

用途：轮询进度 timeline，返回该 progressId 关联的 timeline（数组）。

响应（200 application/json）：
{ "timeline": [ { "step": "...", "ts": 123, "meta": {...}, "artifacts": {...} }, ... ] }

---

# 备注与实现建议
- 每个 agent 服务必须在其代码树内保存独立提示词目录（例如 `prompts/`），并在 `GET /system-prompt` 读取对应文件返回；禁止从其它 agent 的提示词目录读取数据。
- 存储路径（sessions/artifacts/logs）应以 agent id 为前缀或命名空间。
- 建议后端同时提供 OpenAPI/Swagger 描述文件以便前端或第三方自动生成客户端代码。

## 服务特定说明：`circuit-fine-agent`

此服务为精细评审专用 agent，基路径与配置已与 `circuit-agent` 完全隔离。

- Default basePath: `/api/v1/circuit-fine-agent`
- Default port: `4002` (可通过 `PORT` 环境变量覆盖)
- Storage root: `services/circuit-fine-agent/storage`（sessions/artifacts 命名空间独立）

请参考仓库中为该服务生成的 OpenAPI 草案： `services/circuit-fine-agent/openapi.yaml`。

主要端点（与通用接口一致，但基于上方 basePath）：

- POST /api/v1/circuit-fine-agent/orchestrate/review
- POST /api/v1/circuit-fine-agent/modes/direct/review
- POST /api/v1/circuit-fine-agent/modes/structured/recognize
- POST /api/v1/circuit-fine-agent/modes/structured/review
- POST /api/v1/circuit-fine-agent/modes/structured/aggregate
- GET  /api/v1/circuit-fine-agent/sessions/list
- GET  /api/v1/circuit-fine-agent/sessions/{id}
- POST /api/v1/circuit-fine-agent/sessions/save
- DELETE /api/v1/circuit-fine-agent/sessions/{id}
- GET  /api/v1/circuit-fine-agent/system-prompt?lang=zh
- GET  /api/v1/circuit-fine-agent/progress/{progressId}

# 变更记录
- 2025-09-29: 初始草案，由 GPT-5 Mini 编写。
