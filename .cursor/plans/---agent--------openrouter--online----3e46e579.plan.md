<!-- 3e46e579-1e90-40ad-bf43-acd7ae4ee397 38011e69-42f7-42ba-acef-1245b1f89da0 -->
# 将单 agent 联网搜索改为 OpenRouter :online 实现

概述：用 `OpenRouterSearch` 替换现有的 `DuckDuckGoHtmlSearch`，并在代码中移除其它联网检索实现。默认检索模型为 `openai/gpt-4o:online`，可通过环境变量 `OPENROUTER_SEARCH_MODEL` 覆盖。所有原来依赖 `SearchProvider` 的位置（`DirectReviewUseCase`、`StructuredRecognitionUseCase` 等）将注入新的 provider。完成后同步更新 `CURSOR.md` 的主体与变更记录。

关键改动文件（建议编辑清单）：

- 新增：`services/circuit-agent/src/infra/search/OpenRouterSearch.ts`（实现 OpenRouter 联网搜索）
- 修改：`services/circuit-agent/src/bootstrap/server.ts`（替换注入，将 DuckDuckGo 换为 OpenRouterSearch）
- 修改：`services/circuit-fine-agent/src/bootstrap/server.ts`（若存在类似注入也同步替换）
- 删除：`services/circuit-agent/src/infra/search/DuckDuckGoHtmlSearch.ts` 及其 `dist` 产物（`dist/.../DuckDuckGoHtmlSearch.js`）和 `services/circuit-fine-agent` 下的重导出文件
- 修改：`services/circuit-agent/src/infra/search/index.ts`（如有，导出调整）
- 修改：`CURSOR.md`（更新“变更记录”与“关键实现要点”中关于搜索 provider 的描述）
- 可选：`package.json`/依赖：移除 `node-fetch`（仅当它不被其他模块使用时）

行为细节与实现要点：

- `OpenRouterSearch.search(query, topN)` 将：
- 使用现有的 `OpenRouterTextProvider`（或直接 `postJson`）调用上游 `apiUrl`（通过 `cfg.openRouterBase` 或 `OPENROUTER_BASE`），将 `model` 设置为 `process.env.OPENROUTER_SEARCH_MODEL || 'openai/gpt-4o:online'`。
- 构造 Chat 请求，指示模型“执行网络检索并以 JSON 数组格式返回 topN 个结果，字段为 title 与 url”。例如消息：
- system: "You are a web search tool. Given the user query, return a JSON array like [{\"title\":...,\"url\":...}] with up to N items. No extra text."
- user: the query string
- 解析返回文本，尝试 JSON.parse；若解析失败，尝试按行抽取 URL/title（最后回退为空数组）。
- 捕获并在异常时返回空数组（保持现有代码容忍失败的策略）。

兼容性考虑：

- `DirectReviewUseCase` 与 `StructuredRecognitionUseCase` 已按 `SearchProvider` 抽象使用 provider，无需修改用例逻辑，只有注入点需要替换。
- 保留 `enableSearch` 开关逻辑不变（由 `POST /orchestrate/review` 的 `enableSearch=true` 触发）。
- 为了安全，`OpenRouterSearch` 不会记录完整响应；仅在 artifact 保存流程中由已有 artifact 机制记录请求/响应（若需要）。

配置与运行：

- 新增/说明环境变量：
- `OPENROUTER_SEARCH_MODEL`（可选，默认 `openai/gpt-4o:online`）
- 保持 `OPENROUTER_BASE` 与当前 `OpenRouterTextProvider` 一致的配置方式（不会新增新的凭据配置方式）。

变更日志（将在 `CURSOR.md` 追加）：

- 增：OpenRouter 在线检索 provider `OpenRouterSearch`；移除 DuckDuckGo HTML 抓取实现并清理相关导出/引用。

执行步骤（按顺序）：

1. 添加 `OpenRouterSearch` 文件并实现 `SearchProvider` 接口。  
2. 修改 `services/circuit-agent/src/bootstrap/server.ts`：引入并实例化 `OpenRouterSearch`，用其替换 `DuckDuckGoHtmlSearch` 的注入（Direct 与 Structured 两处）。  
3. 在 `services/circuit-fine-agent` 中同步替换任何重导出或使用点（`DuckDuckGoHtmlSearch` 重导出文件）。  
4. 删除 `DuckDuckGoHtmlSearch.ts` / `dist` 产物与冗余导出文件。  
5. 可选：移除 `node-fetch` 依赖（若确认不再被其他模块使用）。  
6. 更新 `CURSOR.md`（主体说明与变更记录追加）。  
7. 运行 lint / 启动服务进行 smoke 测试（你确认执行后我可以提供具体命令和后续支持）。

风险与回退：

- 在线模式依赖 OpenRouter 的计费/配额与上游 model 行为；若上游不可用或超额，search 将返回空数组且不影响主流程（保持 fail-soft）。
- 若需要保留离线/免费回退（DuckDuckGo），请确认是否保留备份 provider（目前你选择全部移除）。

待你确认后我会生成精确的代码编辑清单与每处编辑的具体代码片段（包括 `OpenRouterSearch.ts` 的完整实现、`bootstrap/server.ts` 的替换片段、以及 `CURSOR.md` 的变更描述），然后提交计划以供你批准并执行。

### To-dos

- [ ] 实现 OpenRouterSearch 并加入项目
- [ ] 替换 bootstrap 中的 DuckDuckGo 注入为 OpenRouterSearch
- [ ] 移除 DuckDuckGoHtmlSearch 源文件与 dist 产物
- [ ] 更新 CURSOR.md 的主体描述与追加变更记录