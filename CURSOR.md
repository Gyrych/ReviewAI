# CURSOR.md — 项目记忆与快速参考（中文)

创建者: GPT-5 Mini（为用户生成）

创建日期: 2025-09-29

说明：本文件是面向内部与外部开发者的项目速查与变更记录，内容严格依据当前代码实现编写。任何代码或环境变更后请同步更新本文件。

一、项目概览

本仓库（ReviewAI）实现电路原理图的可视化识别与基于 LLM 的自动化评审流程，主要功能链：

- 图像/附件（PNG/JPEG/PDF）输入 → 视觉模型识别（多轮/单轮）→ 结构化电路 JSON（components/nets）
- 基于结构化结果与输入上下文，调用文本/视觉 LLM 生成 Markdown 格式的评审报告
- 前端提供 SVG overlay 用于人工核对与交互；支持会话保存/恢复与多轮对话

主要模块：

- `frontend/`：Vite + React + TypeScript 客户端，包含通用组件与按 agent 划分的表单（`frontend/src/agents/*`）。
- `services/circuit-agent/`：主后端微服务，负责识别、直评、并行评审与整合流程（默认端口 4001，基路径 `/api/v1/circuit-agent`）。
- `services/circuit-fine-agent/`：用于精细/电路图评审（委员会架构）工作流的后端，结构与 `circuit-agent` 对应（默认端口 4002）。
- `ReviewAIPrompt/`：项目运行时依赖的提示词集合（按 agent/语言/轮次组织），缺失或为空将导致后端 fail-fast。

二、快速启动（开发）

前提：Node.js >= 18

- 一键跨平台：`node start-all.js`（会检测并在必要时安装子包依赖，然后并行启动 `services/circuit-agent`、`services/circuit-fine-agent`、`frontend`）。
- Windows 专用：`start-services.bat`（分窗口启动并尝试释放常见被占端口）。
- 单独启动（调试）：分别在三个子目录运行 `npm install` + `npm run dev`。

端口（默认）：

- `frontend`（Vite dev）：5173（开发模式下代理到子服务）
- `circuit-agent`：4001
- `circuit-fine-agent`：4002

三、提示词（Prompts）

说明：代码中 `PromptLoader` 明确从 `ReviewAIPrompt/{agent}/{filename}` 加载提示词，并在文件缺失或为空时抛出 `PromptLoadError`（fail-fast）。提示词按 agent 与语言（`zh`/`en`）组织，支持 `initial` / `revision` 变体以及多种 pass（macro/ic/rc/net/verify/consolidation）。

代码加载示例（实现依据）：

- `ReviewAIPrompt/circuit-agent/system_prompt_initial_zh.md`
- `ReviewAIPrompt/circuit-agent/system_prompt_revision_en.md`
- `ReviewAIPrompt/circuit-fine-agent/system_prompt_zh.md`
- `ReviewAIPrompt/circuit-fine-agent/macro_prompt.md` 等

注意：运行前请确认 `ReviewAIPrompt/` 下对应 agent 子目录中包含所需文件且非空；否则部分路由（如 `/orchestrate/review` 在 direct 模式）会返回 500 并报告加载失败。

四、关键实现要点（对开发者的重要提示）

- `PromptLoader`（`services/*/src/infra/prompts/PromptLoader.ts`）负责按 agent/language/variant 解析文件名、校验存在性并缓存内容；提供 `preloadPrompts` 用于启动预热。
- `orchestrate` 路由支持 `directReview` 切换直评/精细流程；在 direct 模式下会根据 `history` 判断是否为修订轮（`initial` vs `revision`）并加载对应 system prompt。
- 模型命名约定：引入 **主模型（main model）** 与 **副模型（aux model）** 概念：主模型用于视觉识别与评审（由前端顶部第一行 `model` 管理并随会话保存）；副模型用于检索/摘要（由前端顶部第二行 `auxModel` 管理并随表单以 `auxModel` 字段提交，后端优先使用 `body.auxModel`，不存在时回退到 `model`）。
- `DirectReviewUseCase` 会：
  - 将系统提示、requirements/specs/dialog 与历史合并成富消息（rich messages）发送给视觉/文本上游；
  - 在 `enableSearch=true` 时，先执行“识别轮”提取关键元器件与技术路线清单；随后对每个关键词进行在线检索并逐 URL 生成摘要（默认≤1024词，结构化要点），进行关键词与 URL 去重，过滤失败短语（如“无法直接访问该网页内容”等）后再注入，将合格摘要各自作为独立的 system 消息注入上下文；
  - 默认搜索提供者为基于 OpenRouter 的 `OpenRouterSearch`（使用 `:online` 模式，支持 `search()` 与 `summarizeUrl()`）。
- 将附件转换为 data URL 后随消息发送（MVP 实现，注意 payload 大小）；
- 保存完整的 LLM 请求/响应 JSON 与生成的 Markdown 报告为 artifact（便于回溯与审计）。
- 视觉提供者（`OpenRouterVisionProvider`）尝试从上游返回文本中提取 JSON，并对常见字段做兼容性归一化（components/nets）。
- 工件存储由 `ArtifactStoreFs` 在服务的 storage 根目录下实现，保存路径并返回 `/artifacts/:filename` 的静态访问 URL。

五、API 概要（以 `circuit-agent` 为例）

基路径：`/api/v1/circuit-agent`

- `GET /health` — 健康检查
- `GET /progress/:id` — 查询进度
- `GET /artifacts/:filename` — 静态工件访问
- `GET /system-prompt?lang=zh|en` — 获取 system prompt（供前端展示/下载）
- `POST /orchestrate/review` — 统一编排入口（multipart），参数：`apiUrl`、`model`、`directReview`、`language`、`history`、`enableSearch` 等；直评模式会自动加载对应 system prompt 并走 `DirectReviewUseCase`。

说明：当 `enableSearch=true` 时，默认走“单次请求（single-shot）检索+摘要”流程：后端向具备联网能力的模型发起一次对话，模型在一次推理中完成“检索→去重→整合摘要→输出 citations”。时间线写入 `search.single_shot.request/response` 与 `search.trace.summary.saved`。响应对象同时包含 `searchSummaries`（整合摘要）与 `citations`（模型返回的引用列表）。

- `POST /modes/structured/recognize` — 结构化识别（multipart）
- `POST /modes/structured/review` — 结构化多模型评审（json）
- `POST /modes/structured/aggregate` — 最终整合

会话管理：`POST /sessions/save`、`GET /sessions/list`、`GET /sessions/:id`、`DELETE /sessions/:id`

六、运行时配置（环境变量）

- `PORT` — 服务端口覆盖
- `OPENROUTER_BASE` — 上游模型提供者（OpenRouter 兼容）
- `REDIS_URL` — 可选：Redis 连接用于进度存储
- `LLM_TIMEOUT_MS`, `VISION_TIMEOUT_MS`, `FETCH_RETRIES`, `KEEP_ALIVE_MSECS` — 网络/超时相关
- `STORAGE_ROOT` — 指定 artifact/session 的存储根目录（可覆盖服务默认）
 - `PROMPT_PRELOAD_STRICT` — 服务进程在任何环境均严格预热，缺失或语义空白即 fail-fast（非 0 退出）；任何配置不得在服务进程内放宽该策略；该开关仅供外部“预检脚本”使用，不影响服务进程行为。健康端点可暴露最近一次预热耗时指标（见 SC-001/SC-002）。

七、异常/故障排查要点

- `Failed to load system prompt`：检查 `ReviewAIPrompt/{agent}/{expected_filename}` 是否存在且非空。
- 上游返回 HTML/404：检查 `apiUrl` 与模型名称（OpenRouter 路径需按上游要求设置）。
- 端口冲突/服务不可用：检查 `start-all.js` 的依赖安装逻辑与各子服务是否已启动。
- 结构化识别返回 422：通常代表识别置信度不足或网表冲突，需人工复核并调整 prompts/模型。

八、安全与隐私

- 工件包含完整请求/响应 JSON（用于调试）：在共享/生产环境中请限制 artifact 访问或启用额外的脱敏策略。
- 服务在日志中尽量不记录 Authorization 头，但上游调用仍使用客户端传入的 `Authorization`（前端/部署时请妥善保存密钥）。

九、前端本地配置持久化

- 为改善用户体验，API Key 支持在浏览器端持久化为默认值，存储在 `localStorage` 的 `apiKey` 键下。应用在启动时会尝试从 `localStorage` 读取该键并回填顶部的 API Key 输入框；当用户在顶部输入框修改 Key 时，新的 Key 会立即写回 `localStorage`，以便不同 agent/页面间共享同一 Key（全局作用域）。
- 请注意安全风险：该 Key 以明文保存在浏览器本地存储中。禁止在日志或工件中记录该 Key；在共享环境或公共计算机上请务必清除浏览器存储或使用私有浏览器会话。

十、开发/贡献建议

- 本项目为多服务结构，建议在本地使用 `node start-all.js` 启动并逐服务调试。
- 提示词管理：请在 `ReviewAIPrompt/` 下用 Git 管理提示词变更，并在重大变动后同步更新本文件的变更记录。

十一、文件索引（重要实现文件参考）

- `services/circuit-agent/src/infra/prompts/PromptLoader.ts` — prompt 加载逻辑（按 agent/language/variant）
- `services/circuit-agent/src/interface/http/routes/orchestrate.ts` — 编排路由（direct/structured）
- `services/circuit-agent/src/app/usecases/DirectReviewUseCase.ts` — 直评用例实现
- `services/circuit-agent/src/infra/http/OpenRouterClient.ts` — 上游 HTTP 客户端
- `services/*/src/infra/storage/ArtifactStoreFs.ts` — 工件保存实现
- `services/circuit-agent/src/infra/search/OpenRouterSearch.ts` — OpenRouter 在线检索 provider（替代 DuckDuckGoHtmlSearch）

变更记录（摘要）

- 2025-09-29: 初始创建，AI 助手生成基础项目说明与早期 PRD 记录。
- 2025-09-30: 新增多轮对话式电路图评审（主副模型架构）（`DirectReviewUseCase` 支持 `history`；前端支持多轮提交与会话保存）。
- 2025-10-01: 引入基于 agent/language/variant 的 `PromptLoader`（强制校验提示词文件存在性）并在 `orchestrate` 中使用修订轮判定逻辑；同时整理 `ReviewAIPrompt/` 目录结构（`circuit-agent` 与 `circuit-fine-agent` 子目录）。
- 2025-10-08: 重写并同步 `CURSOR.md`，与代码实现一致，目标读者：外部/内部开发者、演示客户与维护人员。
- 2025-10-08: 在前端页眉中添加版本号与作者联系方式显示（`frontend/src/App.tsx`），并新增 PRD 文档 `doc/prd/header-version-contact-prd.md`。
- 2025-10-09: 将搜索提供者替换为 OpenRouter 在线搜索实现 `OpenRouterSearch`，移除 `DuckDuckGoHtmlSearch`，并將 `POLICIES.SEARCH_PROVIDER` 值更新為 `openrouter_online`（后端注入点已替换，`CURSOR.md` 已同步更新）。
- 2025-10-09: 電路圖評審流程增强，相關文件修改與新增；包括 `ReviewAIPrompt` 的识别輪提示詞新增與 `DirectReviewUseCase` 修正。
- 2025-10-09: 清理工作区中的旧工件与临时会话文件，避免敏感信息进入版本库。
- 2025-10-10: 在 `services/circuit-agent` 新增兼容 `GET /artifacts` 路由并清理旧 dist 产物。
- 2025-10-11: 新增并本地化 `search_prompt_zh.md`。
- 2025-10-12: 新增服务 README 文件（中英文）。
- 2025-10-23: 为 Speckit 宪法合规性创建规范 `specs/003-validate-code-against-constitution` 并生成任务/清单以支持自动化验证。
- 2025-10-23: 完成 T024（端到端验证）并产出 Playwright 报告至 `frontend/test-reports/`。
- 2025-10-23: 在 `start-services.bat` 中注入 `OPENROUTER_BASE` 默认值以改善本地启动体验（示例值，仅用于本地开发）。
- 2025-10-23: 补充中文提示词文件以避免 `PromptLoader` fail-fast。
- 2025-10-24: 补丁级文档修订 — 将 `.specify/memory/constitution.md` 更新为版本 `1.5.1`（Last Amended: 2025-10-24），目的为措辞澄清、去重与可读性改进（PATCH）。
- 2025-10-24: 创建 feature 规范并新增检查清单：`.specify/features/update-frontend-single-agent/spec.md` 与 `.specify/features/update-frontend-single-agent/checklists/requirements.md`（AI 助手生成，待人工复核）。
说明：本次为文档性修正（PATCH），未修改治理原则的实质内容。

- 2025-10-25: 由 AI 助手执行并完善 `specs/004-audit-constitution` 的实施计划与配套文档（执行 `/speckit.plan`）：
  - 修改/新增文件：
    - `specs/004-audit-constitution/plan.md`（补充 Summary、Technical Context、验证脚本与 CI gates）
    - `specs/004-audit-constitution/research.md`（新增，记录 Phase 0 决策与下一步任务）
    - `specs/004-audit-constitution/data-model.md`（新增，定义核心实体与校验规则）
    - `specs/004-audit-constitution/quickstart.md`（新增，补充运行与验证脚本说明）
    - `specs/004-audit-constitution/contracts/openapi.yaml`（新增，补充错误响应 schema 与 diagnostics endpoint）
    - `specs/004-audit-constitution/readme-template.md`（新增，README 中文模板）
    - `specs/004-audit-constitution/comment-template.md`（新增，中文头部注释模板示例）
    - `scripts/check-prompts.ps1`（新增，提示词完整性校验脚本）
    - `scripts/check-readme-sections.ps1`（新增，README 必需章节校验脚本）
  - 目的：使实施计划可执行、可验证，并补充契约与自动化校验入口；后续建议实现注释校验脚本并在 CI 中集成。

- 2025-10-25: 由 AI 助手生成并写入 `specs/004-audit-constitution/tasks.md`（执行 `/speckit.tasks`），任务包括启动检查、前端错误兜底、README 双语同步，并列出实现优先级与 MVP 建议。
 - 2025-10-25: 修订 `specs/004-audit-constitution/spec.md`（FR-001、SC-001/SC-002、Clarifications Q5）以强制生产严格预热并补充可测量要求；更新 `plan.md`（Constraints、CI gates）；同步服务文档 `services/circuit-agent/README*.md` 增加 Strict Preload 说明；在 `tasks.md` 固定 T007 测试位置、扩大 T017 覆盖范围、细化 T020 生产强制，并新增治理/门控/指标相关任务 T022..T035。

- 2025-10-25: 统一严格预热策略（所有环境 fail-fast），修订 `specs/004-audit-constitution/spec.md`（FR-001、Clarifications 与错误负载约定）、`plan.md`（Constraints 与结构树）、`tasks.md`（统计与 Support 标注、T009A 新增、T020 收紧）、扩展 `openapi.yaml` 的 `ErrorResponse.missingPaths`、在 `services/circuit-agent` 中新增并注册 `POST /diagnostics/export` 路由、调整 `src/bootstrap/server.ts` 启动严格失败逻辑、补充先决脚本 `.specify/scripts/powershell/check-prerequisites.ps1`、同步中英 README 的严格预热说明。
 - 2025-10-25: 宪法审计整改（/speckit.analyze 建议落地）：
   - `specs/004-audit-constitution/spec.md`：FR-001 增加“10s 内 fail-fast”与“缺失绝对路径”要求；Clarifications Q5 同步。
   - `specs/004-audit-constitution/plan.md`：Constraints 与 CI gates 固化 10s/非 0 退出门槛；未达标 CI 失败。
   - `services/circuit-agent/src/bootstrap/server.ts`：合并 `/artifacts` 列表路由为单一实现（提取工厂函数）。
   - `services/circuit-agent/README.md` 与 `README.zh.md`：严格预热补充 10s 时限说明；新增 structured 模式退役（410）说明与替代指引。
   - `scripts/check-readme-sections.ps1`：新增最小等效性检查（标题数与 API 条目数）。
   - `scripts/check-head-comments.sh`：输出 JSON 报告 `docs/comment-coverage-report.json` 并使用非 0 退出门槛。
   - `scripts/check-contract-implementation.js`：新增契约-实现一致性校验脚本（OpenAPI vs Express 路由）。
   - `specs/004-audit-constitution/tasks.md`：为 T017/T028 增补完成定义与产出（注释覆盖报告、dead-code 报告）。
 - 2025-10-26: US1 实施推进与契约检查优化
   - 新增与修改：
     - `PromptLoader.preloadPrompts` 增加严格预热选项并在启动启用；
     - 启动日志新增已加载提示词绝对路径与修复建议（T008/T009 完成）；
     - `scripts/check-contract-implementation.js` 支持扫描 `bootstrap/server.ts` 并规范化 `${BASE_PATH}`，仅对缺失契约端点失败，额外端点告警；
     - 在 `services/circuit-agent` 添加 `tests/promptloader.test.ts` 并修正 Vitest 配置，单测通过（T007 完成）；
     - 勾选 `tasks.md` 的 T007、T009A；
 - 2025-10-26: US2 前端错误兜底与诊断导出
   - 新增 `frontend/src/components/ErrorDiagnostic.tsx`（错误提示+导出诊断按钮，调用 `/diagnostics/export`）；
   - 在 `frontend/src/components/ReviewForm.tsx` 集成错误兜底组件，错误时渲染并传入 `agentBase` 与 `progressId`；
   - 在 `frontend/src/config/apiBase.ts` 新增 `parseApiError` 并在 `ReviewForm` 使用，完成全局错误处理集成；
   - 勾选 `tasks.md` 的 T010、T011、T012。
 - 2025-10-26: US3 README 双语同步
   - `services/circuit-agent/README.md` 与 `README.zh.md`：补充 `/diagnostics/export` 接口说明；
   - `frontend/README.md` 与 `README.zh.md`：加入 Mermaid 架构图与 Playwright 执行步骤；
   - 在 `specs/004-audit-constitution/tasks.md` 勾选 T014、T015、T016。
 - 2025-10-26: 严格预热与实施推进（/speckit.implement）
   - 修复与增强：
     - 更新 `services/circuit-agent/src/infra/prompts/PromptLoader.ts`，为 `preloadPrompts` 增加严格预热选项；
     - 在 `services/circuit-agent/src/bootstrap/server.ts` 启用严格预热（缺失即退出，满足 FR-001）；
     - 在 `services/circuit-agent/src/config/config.ts` 读取 `PROMPT_PRELOAD_STRICT`（服务端仍强制严格，变量供外部预检脚本使用）；
     - 在根 `package.json` 增加 `check:prompts`、`check:readme`、`check:contract` 脚本；
   - 文档与任务：
     - 在 `specs/004-audit-constitution/tasks.md` 勾选 T004、T005、T006、T020、T021；
     - 完成 Phase 1（T001-T003），保存 `prompt-check.log`；
     - 完成 `checklists/requirements.md` 阻断项并通过；
- 2025-10-26: 完成 T017（中文头部注释覆盖）
  - 脚本：强化 `scripts/check-head-comments.sh`，限制扫描 `services/circuit-agent/src` 与 `frontend/src`，忽略 `node_modules/dist/build`；修复子进程聚合导致的“误判通过”；输出 `docs/comment-coverage-report.json`。
  - 代码：为关键导出（usecases、infra、routes、frontend 组件与类型等）补充结构化中文头注（用途/参数/返回/示例）。
  - 结果：检查通过，退出码 0；产出报告覆盖率合格。
- 2025-10-26: 完成 T022-T026（治理与门控）
  - 规范：`specs/004-audit-constitution/spec.md` 强化 FR-001 与 Clarifications Q5（≤10s、服务内不得放宽）；
  - 文档：`services/circuit-agent/README(.zh).md` 增补 Strict Preload 配置与排查章节；
  - 脚本：根 `package.json` 新增 `check:comments`；`quickstart.md` 增补执行说明；
  - 结果：注释覆盖脚本通过；契约/README 检查通过。
- 2025-10-26: T027-T031（治理文档）
  - 新增：`doc/service-boundary-audit.md`（服务边界审计）、`doc/dead-code-report.md`（建议稿）、`doc/analysis-report.md`（合规汇总）、`doc/feature-flags.md`（Feature Flag 治理）。
 - 2025-10-25: 修复 `.specify/scripts/powershell/check-prerequisites.ps1` 的重复参数块，恢复脚本可执行；执行 `/speckit.implement` 第 1 步并在 `specs/004-audit-constitution/tasks.md` 勾选 T001。

- 2025-10-26: 在 `specs/005-single-shot-search-summary/spec.md` 中新增澄清：引用（Citation）将作为独立实体存在，包含完整追溯字段（`url`,`title`,`snippet`,`start_index`,`end_index`,`domain`,`confidence_score`,`raw_html`,`fetch_timestamp`,`mime_type`,`favicon`）。

- 2025-10-27: 文档修正（AI 助手） — 对 `specs/005-single-shot-search-summary` 执行以下只读式规范修订并同步：
  - 在 `spec.md` 中统一 FR-008/FR-017 语义，改为“不得对外暴露多轮切换开关；旧多轮仅可分阶段退役且须包含备份/回滚”；为 FR-005 和 FR-013 添加量化建议（context_scale tokens、soft/hard timeout、默认 token budget）；
  - 新增 `specs/005-single-shot-search-summary/quantified_thresholds.md`，列出 context_scale、timeout、budget 与 CI 可验证阈值（供 T051 使用）；
  - 在 `tasks.md` 中将 T001 标记为已完成、将 T002/T003 标注为阻塞优先、添加 T054（摘要长度自定义）与 T055（API 版本化）两个任务，并更新任务总数注记；
  - 在 `data-model.md` 中对 `Citation` 实体追加索引、脱敏、审计字段与保留策略建议；
  - 目的：消除文档间语义冲突（宪法一致性）、提供可测试的非功能阈值、补充缺失任务并增强数据模型供迁移与实现参考。

变更记录（AI 实施）

- 2025-10-28: 添加 `services/circuit-agent/src/models/citation.ts` 实体定义与 `specs/005-single-shot-search-summary/migrations/001_create_citation_table.sql` 迁移脚本以实现 T010/T005。目的：实现 Citation 实体与持久化迁移，满足规格中关于引用审计与检索展示的要求。

- 2025-10-28: 添加 `services/circuit-agent/src/models/annotatedMessage.ts` 实体与 `specs/005-single-shot-search-summary/migrations/002_create_annotated_message_table.sql` 迁移脚本以实现 T011/T006。目的：实现 AnnotatedMessage 实体以保存模型原始响应、引用索引与审计元数据。
- 2025-10-28: 添加 `services/circuit-agent/src/services/responseParser.ts` 及单元测试 `services/circuit-agent/tests/responseParser.unit.spec.ts`，并新增 `/api/v1/search-summary` 路由实现 `services/circuit-agent/src/interface/http/routes/search-summary.ts`。目的：完成 US1 的最小可用实现，支持原始响应解析、引用保存与 artifact 归档。

- 2025-10-28: 前端变更：新增 `frontend/src/utils/apiClient.ts`，更新 `frontend/src/components/ResultView.tsx` 以渲染 `citations`，并添加样式 `frontend/src/styles/result-card.css`。目的：在前端展示解析出的引用并支持对 `/search-summary` 的请求。已同步更新 `specs/005-single-shot-search-summary/tasks.md` 对应 T017–T019 为已完成。
 - 2025-10-28: 退役计划：为移除旧多轮实现添加 `specs/005-single-shot-search-summary/removal_plan.md`（描述发现、备份、迁移、验证与回滚流程），并在根 README（中/英）中加入退役说明与回滚链接，确保使用者了解单轮默认行为与移除流程。

- 2025-10-28: 单次请求（single-shot）检索+摘要落地：
  - 新增 `OpenRouterSearch.singleShot()`（一次调用完成检索与整合摘要，返回 `{ summary, citations[] }`）。
  - 重构 `interface/http/routes/orchestrate.ts` 的搜索分支为 single-shot，并写入 `search.single_shot.request/response` 日志与 `search_single_shot` 工件；在响应中附带 `citations`。
  - 目的：将“搜索轮与摘要轮”合并为一次模型请求，降低时延与成本，统一日志与工件便于核对。
