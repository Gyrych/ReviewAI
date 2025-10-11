# PRD: 多轮对话式电路图评审（主副模型架构）

## 背景与目标
- 目标：将现有的“电路图评审（主副模型架构）”从一次性问题确认流程改为**对话式多轮评审**，支持用户在前端反复与模型交互，逐步修正与完善评审报告，最终导出为 Word 文档。
- 范围限制：仅改造 `电路图评审（主副模型架构）`（frontend: `frontend/src/agents/circuit/ReviewForm.tsx` 与通用 `frontend/src/components/ReviewForm.tsx`、`ResultView.tsx`、`FileUpload.tsx`；backend: `services/circuit-agent` 下 `DirectReviewUseCase` 与 orchestrate 路由及 sessions 持久化相关代码）。

## 用户故事
1. 作为工程师，我可以上传图片或 PDF（最多 20 个文件，单文件大小限制沿用现有或前端默认）并填写“设计需求”、“设计规范”和“对话内容”（纯文本）。
2. 我可以选择启用“器件搜索”，使后端在审查过程中对器件进行联网检索以辅助判断。
3. 我点击提交后，前端将系统提示词、用户输入、附件以及会话历史一并发送给后端；后端调用 LLM 并将模型返回的 Markdown 结果显示在评审结果区域。
4. 我可以在结果区域对模型输出进行指正或补充（填写新的对话内容），再次提交触发新一轮评审；每一轮的用户输入、模型输出与附件元信息都保存在会话历史中并可恢复。
5. 我可以随时中止正在进行的请求（保留会话历史），以后可以继续编辑并再次提交以恢复流程。
6. 最终我可以导出最终评审结果为 Word 文档（.doc 或 .docx，导出内容基于最终的 Markdown 报告）。

## 功能与接口细节
- 前端（变更点）
  - 文件上传限制：只允许 `image/jpeg`, `image/png`, `application/pdf`，最大文件数 `20`。
  - UI：取消“问题确认窗格”（Question Confirmation Pane）。对话入口 `dialog` 始终可编辑，提交后将当前 dialog 追加到会话历史并清空输入框（保留在 UI 中以便继续）。
  - 提交动作（Submit）：构造 multipart/form-data，字段包括 `systemPrompt`（由前端或后端统一注入）、`requirements`、`specs`、`dialog`（本轮）、`history`（JSON 序列化的历史数组，包含每轮的 {dialog, modelMarkdown, attachmentsMeta, ts}）、`enableSearch`（boolean）。
  - 中止（Abort）：终止当前 HTTP 请求但保留本地会话历史与已得到的模型输出；用户可继续编辑并再次提交。
  - 会话保存/加载：复用现有 `sessions` API，确保保存时将 `history` 字段完整持久化；加载时恢复 `history` 与附件元信息（附件二进制可另行存储在 artifact 路径中并由后端按需提供下载）。
  - 导出为 Word：在结果面板提供“导出报告”按钮，调用后端导出接口或在前端将 Markdown 转为 `.doc`（推荐后端生成 `.docx` 或前端生成并触发下载；实现上先做前端基于现有库生成 `.doc` 的简单实现）。

- 后端（变更点）
  - 路由：保留现有 `orchestrate` 路由；对 `directReview` 分支增强 `history` 支持（接受 `history` 字段并将其原封不动传递给 `DirectReviewUseCase`）。
  - DirectReviewUseCase：
    - 支持 `request.history`（数组），当用户多轮提交时，新的请求会携带此前 history；UseCase 在构造发送给 LLM 的富消息（rich messages）时，将历史以合适的格式附加（例如把每轮的用户 dialog 和模型 markdown 分别作为 user/assistant messages），以便 LLM 能基于上下文修正报告。
    - `enableSearch`：当启用时，UseCase 应在调用 LLM 前/中向组件搜索服务（后台或第三方 API）发起检索并将检索摘要结果作为 system 或 user 附加上下文发送到 LLM；实现方式可先采用简单 HTTP 请求到现有的 `DuckDuckGoHtmlSearch` 的封装接口，由后端负责限速与缓存。具体：在 `DirectReviewUseCase` 中，若 enableSearch === true，则调用 `DuckDuckGoHtmlSearch.search(query)`（可用用户 dialog 或设计需求中关键关键词生成 query），并将 topN 摘要加入到发送的 messages 中。
  - 会话持久化：确保 `sessions` 存储将 `history` 字段序列化并保存（当前 FS 存储应能直接保存 JSON），并在加载时恢复 `history`。附件二进制不需全部保存在 session JSON，但需要在 artifacts 存储中保留引用以便恢复时能重新下载或重新发送给 LLM（MVP：保存附件元信息并 artifact id）。

## 数据模型
- history: Array<{
  dialog: string,
  modelMarkdown?: string,
  attachmentsMeta?: { name: string, mime: string, size: number, artifactId?: string }[],
  ts: number
}>

## 接口示例
- POST /api/v1/circuit-agent/orchestrate/review
  - form fields: apiUrl, model, systemPrompt, requirements, specs, dialog, history (json-string), enableSearch
  - files: attachments[]

- GET /api/v1/circuit-agent/sessions/:id => returns { id, createdAt, updatedAt, history, attachmentsMeta }

- POST /api/v1/circuit-agent/sessions/:id/export => request { format: 'docx' } -> returns generated file

## 验收标准
- 功能：前端可以上传不超过 20 个图片/PDF，提交后能和模型完成多轮交互；每轮的对话与模型输出被追加保存到 history 中并可在会话加载时恢复。
- UX：移除问题确认窗格，评审结果区域显示模型返回的 Markdown；用户可编辑 dialog 并重复提交直到满意；可中止不丢失历史。
- 搜索：当启用器件搜索 flag 时，后端会将检索摘要传递给 LLM；检索逻辑应对常见查询返回可读摘要用于 LLM 上下文。
- 导出：用户能将最终 Markdown 导出为 Word 文档并下载。

## 非功能性要求
- 保持现有权限与 CORS 设置；不要更改全局端口配置。
- 尽量复用现有 `sessions` API；保证兼容旧会话格式。

## 风险与替代方案
- LLM 请求体可能因图片 data URL 体积过大导致超时或拒绝；可选方案：仅发送附件的 artifact id 让后端/模型 provider 拉取，或降低图片分辨率/限制为文件大小阈值。
- 器件搜索引入第三方依赖，需注意速率限制与隐私；初版采用 DuckDuckGo HTML 抓取摘要作为轻量实现。

## 实施步骤（按优先级）
1. 后端：增强 `DirectReviewUseCase` 支持 `history`，并将历史格式化为 LLM messages（实现 search hook）。
2. 前端：修改 `FileUpload` 最大文件数为 20，移除问题确认窗格。修改 `ReviewForm` 将提交时包含 `history`，支持中止与恢复。
3. 后端：确保 sessions 保存/加载完整 `history`，并实现导出接口（或先让前端导出）。
4. 前端：添加“导出报告”为 Word 功能。
5. 文档同步：更新 `CURSOR.md`、`README.md`、`README.zh.md`。

## 验收测试场景
- 上传 3 张图片并填写需求/规范，启用搜索并多轮提交三次，保存会话并重新加载，能够恢复完整历史并继续会话；导出最终报告并能打开。

## 变更记录
- 创建：2025-09-30  已由 GPT-5 Mini 草拟。
