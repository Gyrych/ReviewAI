# circuit-agent 逐文件分析摘要

以下为对 `services/circuit-agent` 下关键实现文件的逐文件只读分析摘要，供文档、审计与后续开发参考。

1. `src/bootstrap/server.ts`
  - 职责：应用启动、环境加载、路由注册、静态资源挂载、进度 store 初始化（Memory/Redis 回退）、artifact 静态目录挂载与兼容性路由。
  - 关键点：
    - CORS 严格白名单，开放 Authorization 与 Content-Type
    - `PromptLoader` 用于 system prompt 读取（`/system-prompt` 路由）
    - `makeDirectReviewRouter` 与 `makeOrchestrateRouter` 注入 `DirectReviewUseCase`、`IdentifyKeyFactsUseCase` 与 `OpenRouterSearch`

2. `src/interface/http/routes/orchestrate.ts`
  - 职责：统一编排入口，解析 multipart/form-data，处理 `directReview` 分支；实现 `enableSearch` 的识别→检索→逐 URL 摘要→注入系统提示词流程；合并并返回 timeline。
  - 关键点：
    - 更严格的修订判定（基于 history 中的 assistant 条目或 report markers）
    - 对 search 流程的细粒度追踪：生成 search llm request/response artifacts、searchTimelineEntries、trace summary
    - 支持 `auxModel` 作为检索/摘要的上游模型（优先于 `model`）

3. `src/app/usecases/DirectReviewUseCase.ts`
  - 职责：构建富消息（system + extraSystems + user parts + history），将 attachments 转为 data URL，调用视觉/文本上游（vision.chatRich），保存请求/响应 artifact，并返回 Markdown 与 timeline。
  - 关键点：
    - 支持注入 `extraSystems`（由 orchestrate 的检索摘要生成）
    - enableSearch 支持在本用例内执行简化检索与摘要（仍建议通过 orchestrate 的识别轮实现更复杂流程）

4. `src/app/usecases/IdentifyKeyFactsUseCase.ts`
  - 职责：识别轮实现，从附件与文本中抽取 `keyComponents` 与 `keyTechRoutes`（返回 JSON），并保存请求/响应 artifact 与 timeline。
  - 关键点：
    - 使用 `PromptLoader` 加载 `identify` prompt（若缺失回退为内置简化提示词）
    - 对 LLM 响应做 JSON 提取（尝试匹配末尾 JSON），解析失败时保存解析上下文以便离线分析

5. `src/infra/prompts/PromptLoader.ts`
  - 职责：按 agentName/promptType/language/variant 加载提示词文件（来自 `ReviewAIPrompt/`），并进行缓存、预热与错误处理。
  - 关键点：
    - 若文件不存在或为空，抛出 `PromptLoadError`（服务端会返回 500）
    - 提供 `preloadPrompts` 用于在启动时加载所需提示词

6. 其他注意事项
  - ArtifactStoreFs：artifact 持久化位置在 `STORAGE_ROOT/artifacts`，并由 `/artifacts` 静态路由提供访问。
  - TimelineService：为每个关键步骤（llm.request/response、search.*）生成 timeline 条目并可写入进度存储（Redis 优先）
  - SearchProvider（OpenRouterSearch）：提供 `search()` 与 `summarizeUrl()` 用于在线检索与页面摘要

建议与风险提示
---
- Prompt 文件依赖：启动前务必校验 `ReviewAIPrompt/` 目录下的 prompt 是否完整且非空，否则会导致关键接口返回 500。
- Artifact 与隐私：artifact 中可能包含完整上游请求/响应，建议在生产环境对 `/artifacts` 访问做保护或在保存前脱敏。
- enableSearch 的可用性依赖上游网络与 OpenRouter 配置，若需要高可用建议引入重试与缓存策略。


