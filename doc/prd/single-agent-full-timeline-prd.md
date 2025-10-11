# PRD：电路图單 Agent 评审——完整步骤历史与 LLM 交互工件

## 1. 背景与目标

- 背景：当前“电路图單 agent 评审（directReview=true）”仅在时间线中记录了简要的 `llm.request/llm.response` 步骤，但未保存“完整请求/完整返回”工件，同时默认对请求内容做了文本匿名化处理，无法满足“需要展示完整交互信息、不做脱敏”的需求。
- 目标：在“電路圖評審（主副模型架構）”模式下，时间线展示完整的前后端执行步骤，突出标记与大模型交互的步骤，支持在前端展开查看“发给大模型的完整信息（请求体）”与“大模型返回的完整信息（原始 JSON 响应）”。

## 2. 范围

- In Scope：
  - 仅限“電路圖評審（主副模型架構）（directReview=true）”流程。
  - 后端在调用上游前后，生成并挂载 artifacts：`request.json` 与 `response.json`；继续保留最终 `report.md`。
  - 时间线突出 LLM 交互步骤，并在 meta 中补充模型名、API 地址、消息条数等关键统计。
  - 前端时间线保持现有懒加载策略，展开后可查看 artifacts 内容（JSON/文本、图片按现有能力渲染）。
- Out of Scope：
  - 结构化识别、多模型并行评审、终稿整合链路的深度改造（保持现状）。
  - 新增独立接口（沿用既有编排与进度接口）。

## 3. 用户故事

1. 我提交“電路圖評審（主副模型架構）评审”请求后，时间线显示前端与后端的完整步骤。
2. 与大模型交互的步骤清晰标识为 LLM，并提供“请求/返回”工件入口；我可以点击加载并查看完整 JSON 文本。
3. 我可以看到模型名、API 地址、消息条数、是否包含历史、是否包含附件等关键信息。
4. 若上游失败或超时，不保存“失败时的请求/响应工件”，我可以修改参数后重新提交。

## 4. 详细功能说明

### 4.1 时间线与工件

- 新增/完善时间线节点（后端）：
  - `llm.request`：在调用上游前写入；`meta` 补充：`{ modelType: 'llm', apiUrl, model, messageCount, hasHistory, hasAttachments }`；并在 `artifacts.request` 挂载请求体 JSON。
  - `llm.response`：收到上游返回后写入；`meta` 补充：`{ modelType: 'llm', contentLength }`；并在 `artifacts.response` 挂载上游原始 JSON；保留 `artifacts.result` 指向最终 Markdown 报告。
- 工件保存：
  - 目录：`services/circuit-agent/storage/artifacts/`
  - 命名：`YYYY-MM-DDTHH-mm-ss.mmmZ_llm_request_xxxx.json`，`YYYY-..._llm_response_xxxx.json`，`..._direct_review_report_xxxx.md`
  - 访问：`GET /api/v1/circuit-agent/artifacts/:filename`（静态）
  - 体积：接受较大 JSON；前端保持“点击加载”懒加载策略。
- 失败场景：上游错误/超时不保存请求/响应工件，仅返回 502 并允许用户重试。

### 4.2 前端呈现

- 时间线：
  - 继续使用现有分组与高亮方案（LLM 步骤将明显标识）。
  - 在“请求信息”区补充展示：模型名、API 地址、消息条数、是否包含历史、是否包含附件。
  - 在“工件”区显示 Request/Response（JSON 懒加载），以及既有的 `Review Report`。

## 5. 技术方案（概述）

- 后端 `DirectReviewUseCase`：
  - 取消对消息 `parts` 的匿名化处理，改为直接发送原始消息。
  - 在调用前生成 `requestBody = { model, messages: parts, stream: false }`，保存为 `application/json` 工件并挂到 `llm.request.artifacts.request`。
  - 调用上游后将原始返回 `raw` 保存为 `application/json` 工件并挂到 `llm.response.artifacts.response`；同时继续保存 `report.md`。
  - `TimelineService.make` 支持传入可选的 `origin/category`（本需求用于设置 `origin: 'backend', category: 'llm'`）。
- 前端 `ReviewForm`：
  - 时间线详情处新增/补充展示 `apiUrl/model/messageCount/hasHistory/hasAttachments` 等字段。
  - 沿用现有 `ArtifactInline` 的懒加载查看。

## 6. 数据结构与兼容性

- 时间线项（不新增字段，使用既有 `artifacts` 和 `meta`）：
  - `artifacts: { request?: ArtifactRef, response?: ArtifactRef, result?: ArtifactRef }`
  - `meta: { modelType?: 'llm'|'vision', apiUrl?: string, model?: string, ... }`
- 兼容性：前端已兼容 `it.artifacts.request/response/result` 与旧版 `meta.requestArtifact/responseArtifact`。

## 7. 错误处理

- 上游失败/超时：
  - 不持久化请求/响应工件。
  - 由路由返回 502 + 错误信息；用户可改参后重试。

## 8. 性能与安全

- 大体积 JSON：采用懒加载查看，避免一次性传输。
- 明确不脱敏：按用户要求“完整信息，不需要脱敏”；但不记录 `Authorization` 等敏感头信息。

## 9. 接口与依赖

- 无新增后端接口与依赖。
- 仍通过 `GET /progress/:id` 获取时间线，工件通过静态路径懒加载。

## 10. 验收标准

1. 提交“電路圖評審（主副模型架構）评审”，时间线出现 `llm.request` 与 `llm.response`，并分别可展开查看 `Request` 与 `Response` 工件完整 JSON；`Review Report` 仍可查看。
2. `llm.request` 的 meta 中可见 `apiUrl/model/messageCount/hasHistory/hasAttachments` 等字段。
3. 上游失败时不生成 `request/response` 工件，用户可立即重试。

## 11. 测试要点（E2E）

- 模型：`x-ai/grok-4-fast:free`
- OpenRouter API：`https://openrouter.ai/api/v1/chat/completions`
- API Key：由用户提供
- 文件：`C:\\Users\\MACCURA\\OneDrive\\Desktop\\实例电路.png`
- 对话内容：“帮我评审这个电路”
- 期望：时间线可展开查看完整请求/返回 JSON；报告生成成功。


