<!-- b83b3c50-9b4c-4601-8593-54029cbe5dee ed188d34-069d-4e19-b01a-b35211905dcd -->
# 审计计划：单 agent（circuit-agent）评审流程逐文件审计

目标：在不修改代码的前提下，逐文件逐行审查后端 `circuit-agent` 及对应前端实现，验证是否完全实现用户指定的流程（包括可选的器件搜索与资料注入），识别不符合项与候选删除的未使用代码，并给出明确的修改建议与影响说明，后续等待你确认后再执行更改。

范围（重点文件/目录）：

- 后端（主审）
- `services/circuit-agent/src/app/usecases/DirectReviewUseCase.ts`
- `services/circuit-agent/src/app/usecases/IdentifyKeyFactsUseCase.ts`
- `services/circuit-agent/src/interface/http/routes/orchestrate.ts`
- `services/circuit-agent/src/infra/search/OpenRouterSearch.ts`
- `services/circuit-agent/src/infra/providers/OpenRouterTextProvider.ts`
- `services/circuit-agent/src/infra/http/OpenRouterClient.ts`
- `services/circuit-agent/src/infra/prompts/PromptLoader.ts`
- `services/circuit-agent/src/infra/storage/ArtifactStoreFs.ts`
- `services/circuit-agent/src/bootstrap/server.ts`
- `services/circuit-agent/src/domain/contracts/index.ts`
- `ReviewAIPrompt/circuit-agent/` 下的提示词文件（`system_prompt_*.md`、`identify_prompt_*.md` 等）
- 前端（主审）
- `frontend/src/agents/circuit/ReviewForm.tsx`
- `frontend/src/components/ReviewForm.tsx`
- `frontend/src/App.tsx`（agent 注入与参数传递）
- `frontend/src/components/ResultView.tsx`（展示/修订轮交互）

核对项（每一项我都会在代码中定位到文件与行数并注明）：

1. 用户上传/提供资料是否被接收并以 `attachments`/`files` 形式传到后端（multipart 支持）；后端是否将附件转为 data URL 或以可上游发送的格式注入上下文。  
2. 后端是否将 `requirements`、`specs`、`dialog` 等文本合并到 LLM 上下文中（并以约定的 message role/structure 发送）。  
3. `enableSearch` 开关是否由前端传入并在后端生效；当启用时是否执行“识别轮”并调用 `IdentifyKeyFactsUseCase` 以获得 `keyComponents` 与 `keyTechRoutes`。  
4. 如果识别出关键词，后端是否调用 `SearchProvider`（当前实现应为 `OpenRouterSearch`）执行联网检索、对每个 URL 进行 `summarizeUrl()`（或等价摘要）并将摘要以 system 消息注入主上下文（且按用户要求保存摘要）。  
5. 在初始轮是否正确加载 `system` prompt（`initial`）并将其与其他消息合并发送到上游 OpenRouter（或其它兼容客户端），同时保存请求/响应 artifact。  
6. 历史（`history`）与修订轮逻辑：当用户提供历史或已有 assistant 消息时是否切换 `revision` prompt，并且把历史注入上下文以供修订轮使用；修订轮可多次循环。  
7. 前端 UI 是否支持：上传图片/PDF，输入 requirements/specs/dialog，切换 `enableSearch`，并将这些参数与附件和 API Key 一并发送到后端的 `POST /orchestrate/review`。  
8. 结果的展示、异议输入与多轮交互是否由前端正确实现（前端把用户的异议追加至 `history` 并触发后端带 history 的调用）。
9. 工件（artifact）保存与访问：请求/响应、生成 Markdown 报告是否被保存并能通过 `GET /artifacts/:filename` 访问。
10. 异常处理与 fail-fast：缺失必需 prompt 文件时是否抛错；敏感信息（API Key）是否避免记录到日志或 artifact。

输出物（交付成果）：

- 合规性报告：对上述每个核对项给出“满足/部分满足/不满足”，并在不满足项指出代码片段位置与建议修改。  
- 候选删除列表：列出可删除或未使用代码文件/函数（仅清单），并说明删除风险与理由。  
- 修改建议清单：为每个不满足项给出最小可行修复的代码级建议（包括需要改动的文件与简短代码参考），供你确认后我再实施。  

约定（已同意）：

- 我先做只读审计并出报告（不会修改任何文件）。  
- 对于识别出的未使用代码，我先列出清单并等待你的确认再删除（你选择 2a）。

时间估计与里程碑（顺序执行）：

- 快速读取并定位主要文件（已开始并会在下一步完成）：≈5–10 分钟
- 逐文件逐行详细审查并记录证据与不符合项：≈30–60 分钟
- 汇总合规性报告与候选删除列表：≈10–20 分钟

请确认此计划（若确认我将开始执行只读审计并在完成后返回报告）。

### To-dos

- [ ] 读取并定位所有关键实现文件（后端+前端），收集上下文与入口点
- [ ] 逐行审查后端用例与搜索/提示词注入逻辑（DirectReview, IdentifyKeyFacts, OpenRouterSearch）
- [ ] 逐行审查前端表单与 agent 集成，验证 enableSearch/attachments/history 的参数传递
- [ ] 汇总合规性报告、列出未使用代码候选清单，并形成修改建议