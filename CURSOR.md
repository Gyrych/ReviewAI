# CURSOR.md — 项目记忆与快速参考（中文）

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
  - 默认搜索提供者为基于 OpenRouter 的 `OpenRouterSearch`（使用 `:online` 模式，支持 `search()` 与 `summarizeUrl()`）
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

说明：当 `enableSearch=true` 且检索摘要生成成功时，后端除了在 `timeline` 中附带 `search.summary.saved`（含 artifact 引用与 `summarySnippet`），还会在 `timeline` 写入 `search.llm.request/response`（附 `bodySnippet` 与完整 artifact）。响应对象上也会直接返回 `searchSummaries: string[]`（与注入的 `extraSystems` 同源），以便前端兜底展示“检索摘要”。
- `POST /modes/structured/recognize` — 结构化识别（multipart）
- `POST /modes/structured/review` — 结构化多模型评审（json）
- `POST /modes/structured/aggregate` — 最终整合
- 会话管理：`POST /sessions/save`、`GET /sessions/list`、`GET /sessions/:id`、`DELETE /sessions/:id`

六、运行时配置（环境变量）

- `PORT` — 服务端口覆盖
- `OPENROUTER_BASE` — 上游模型提供者（OpenRouter 兼容）
- `REDIS_URL` — 可选：Redis 连接用于进度存储
- `LLM_TIMEOUT_MS`, `VISION_TIMEOUT_MS`, `FETCH_RETRIES`, `KEEP_ALIVE_MSECS` — 网络/超时相关
- `STORAGE_ROOT` — 指定 artifact/session 的存储根目录（可覆盖服务默认）

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
 - 术语统一：将“电路图单agent评审”对外命名为“电路图评审（主副模型架构）”，并在前端、PRD 与 `CURSOR.md` 中同步更新（见 2025-10-11 变更记录）。
- 2025-10-01: 引入基于 agent/language/variant 的 `PromptLoader`（强制校验提示词文件存在性）并在 `orchestrate` 中使用修订轮判定逻辑；同时整理 `ReviewAIPrompt/` 目录结构（`circuit-agent` 与 `circuit-fine-agent` 子目录）。
- 2025-10-08: 重写并同步 `CURSOR.md`，与代码实现一致，目标读者：外部/内部开发者、演示客户与维护人员。
- 2025-10-08: 在前端页眉中添加版本号与作者联系方式显示（`frontend/src/App.tsx`），并新增 PRD 文档 `doc/prd/header-version-contact-prd.md`。
- 2025-10-08: 在前端页眉中添加版本号与作者联系方式显示（`frontend/src/App.tsx`），并新增 PRD 文档 `doc/prd/header-version-contact-prd.md`。
- 2025-10-08: 调整页眉显示：将版本固定为 `v0.2.21`，并在第三行左对齐显示 `联系作者：gyrych@gmail.com`（`frontend/src/App.tsx`、`doc/prd/header-version-contact-prd.md` 已更新）。
- 2025-10-09: 将搜索提供者替换为 OpenRouter 在线搜索实现 `OpenRouterSearch`，移除 `DuckDuckGoHtmlSearch`，并将 `POLICIES.SEARCH_PROVIDER` 值更新为 `openrouter_online`（后端注入点已替换，`CURSOR.md` 已同步更新）。

2025-10-09 变更记录（电路图评审（主副模型架构）评审流程增强）

- 文件修改：
  - `services/circuit-agent/src/domain/contracts/index.ts` — `ReviewRequest` 增加 `extraSystems?: string[]`，`SearchProvider` 增加 `summarizeUrl()`。
  - `services/circuit-agent/src/app/usecases/DirectReviewUseCase.ts` — 修复 `{role,content}` 历史注入；支持注入 `extraSystems`。
  - `services/circuit-agent/src/app/usecases/IdentifyKeyFactsUseCase.ts` — 新增识别轮用例，输出 `{ keyComponents[], keyTechRoutes[] }`。
  - `services/circuit-agent/src/infra/search/OpenRouterSearch.ts` — 新增 `summarizeUrl(url, wordLimit, lang)`。
  - `services/circuit-agent/src/interface/http/routes/orchestrate.ts` — 直评分支串联 识别→检索→逐URL 摘要→注入 `extraSystems`→直评。
  - `ReviewAIPrompt/circuit-agent/identify_prompt_zh.md|identify_prompt_en.md` — 新增识别轮提示词。
- 文件删除：
  - `services/circuit-agent/src/infra/search/DuckDuckGoHtmlSearch.js`
- 目的：
  - 完整实现“电路图评审（主副模型架构）”流程中可选的器件搜索与资料注入环节；
  - 修复历史未正确纳入上下文的问题；
  - 提升报告的可用性与可追溯性。

2025-10-09 变更记录（清理运行时工件）

- **文件/目录删除（工作区）**: `services/circuit-agent/services/circuit-agent/storage/artifacts/*`、`services/circuit-agent/services/circuit-agent/storage/sessions/*`、`services/circuit-agent/services/circuit-agent/storage/tmp/*`
- **目的**: 从工作区删除 LLM 请求/响应、生成报告与会话 JSON，防止这些可能包含敏感信息的文件被提交到 Git 历史。
-- **注意**: 我只删除了工作区中的文件；如果需要彻底从 Git 历史中清除这些文件（bfg/git-filter-repo），请明确指示，操作会影响提交历史并需要你手动在本地执行或授权我为你生成操作步骤。

2025-10-09 变更记录（提示词判定与日志增强）

- **文件修改**: `services/circuit-agent/src/interface/http/routes/directReview.ts`、`services/circuit-agent/src/interface/http/routes/orchestrate.ts`
- **目的**: 修复首轮评审被误判为修订轮的问题；增加决策日志用于排查未来类似问题。
- **主要改动**:
  - 收紧 `isRevisionByHistory` 判定逻辑：仅在历史中存在 `assistant` 消息或显式包含报告/修订标记时，才视为修订轮；避免仅因为 history 中存在 user 条目就误判为修订。
  - 在判定命中报告标记或 assistant 消息时写入详细日志（`console.log`），并在未命中时也写入推断为首轮的信息日志。
-- **影响**: 修复会导致后端在首轮错误使用修订提示词的 bug；提高日志可读性以便审计与回溯。

2025-10-10 变更记录（移除旧产物与添加兼容 artifacts 列表路由）

- 文件删除（工作区）:
  - `services/circuit-fine-agent/dist/infra/search/DuckDuckGoHtmlSearch.js` — 已删除，原因：旧的 dist 导出产物，已被 `OpenRouterSearch` 替代。

- 文件修改：
  - `services/circuit-agent/src/bootstrap/server.ts` — 新增兼容 `GET /artifacts` 路由（返回 artifacts 列表 JSON），用于在静态 artifacts 目录缺失或需要程序化列出 artifacts 时提供可用信息；该路由仅用于调试与兼容性，不改变静态文件访问路径 `${BASE_PATH}/artifacts/:filename`。

- 目的：
  - 清理仓库中不再使用的 dist 产物，减少混淆。
  - 在运行时下增加一个列出 artifacts 的兼容路由，便于前端或运维查看可用工件列表。

2025-10-10 变更记录（编排路由注入统一搜索提供者）

- 文件修改：
  - `services/circuit-agent/src/bootstrap/server.ts` — 调用 `makeOrchestrateRouter` 时显式传入 `search: searchProvider`，使编排路由复用与 `DirectReviewUseCase` 相同的 `OpenRouterSearch`（使用统一的 `cfg.openRouterBase` 与超时配置），避免回退到未配置或不一致的 `OPENROUTER_BASE` 环境变量导致搜索/摘要不可用。
- 影响：
  - 直评启用搜索（`enableSearch=true`）时，识别→检索→摘要链路更稳定；若上游允许 web 插件，摘要将以 artifact 与 `searchSummaries` 字段返回，前端“检索摘要”区域可稳定显示。

2025-10-10 变更记录（i18n 与检索摘要兜底显示增强）

- 文件修改：
  - `frontend/src/i18n.tsx` — 补齐 `

2025-10-11 变更记录（新增搜索轮提示词并本地化）

:- 文件新增：
  - `ReviewAIPrompt/circuit-agent/search_prompt_zh.md` — 将在线检索与页面摘要提示词提取并翻译为中文，供 `DirectReviewUseCase` 在 `enableSearch` 场景下注入。
:- 目的：
  - 将原先内联在 `OpenRouterSearch.ts` 的英文 system 文本外部化并本地化，便于管理与审阅；同时满足 `PromptLoader` 的加载约定，避免运行时因缺失提示词导致 fail-fast。

2025-10-11 变更记录（命名统一）

- 文件修改：
  - 将前端与文档中的“电路图单agent评审”统一更名为“电路图评审（主副模型架构）”。
  - 将前端与文档中的“电路图多agent评审”统一更名为“电路图评审（委员会架构）”。

- 影响范围：
  - 更新文件：`frontend/src/i18n.tsx`、`frontend/src/components/ReviewForm.tsx`、`frontend/src/agents/circuit/ReviewForm.tsx`、`frontend/src/agents/circuit-fine/ReviewForm.tsx`、`doc/prd/*.md`、`ReviewAIPrompt/circuit-fine-agent/system_prompt_zh.md`、`README.zh.md`、`CURSOR.md`。

- 目的：
  - 统一术语以减少文档与界面中的歧义，便于对外沟通与内部维护。

- 2025-10-12: 新增 `services/circuit-agent/README.zh.md` 与 `services/circuit-agent/README.md`，包含 API 说明、架构图（Mermaid）、流程图与使用规范。请在确认文档无误后决定是否将 `CURSOR.md` 中的相关条目进一步细化或移动到项目根 README。

- 2025-10-23: 为 Speckit 宪法合规性创建规范 `specs/003-validate-code-against-constitution/spec.md` 及质量检查清单 `specs/003-validate-code-against-constitution/checklists/requirements.md`，内容包括：提示词完整性校验、前后端解耦核验、双语 README 校验、前端 E2E 测试报告输出要求与启动配置校验建议（文档更新；未进行代码修改）。
 - 2025-10-23: 生成 `specs/003-validate-code-against-constitution/tasks.md`（由 AI 助手生成），该文件列出了按照 `spec.md` 与 `plan.md` 组织的可执行任务清单，包含 Phase1/Phase2/US1-US3/Polish 阶段。任务文件路径：`specs/003-validate-code-against-constitution/tasks.md`。

2025-10-23 变更记录（Speckit 合规性补充）

- 2025-10-23: AI 助手在 `specs/003-validate-code-against-constitution/checklists/requirements.md` 中补充了 Acceptance（验收标准）段，回答并清理了原先未完成的复选项与澄清标记，添加了自动化验证建议与验证步骤（包含指向 `tasks.md` 的 T001/T005/T007/T015 等任务）。

  目的：消除 speckit implement 步骤因文档未完成检查项导致的阻塞，便于 CI/审计与实现团队按明确验收标准完成工作。

- 2025-10-23: 精确化 `specs/003-validate-code-against-constitution/tasks.md` 中若干任务（将 T002 与 T008 拆分并替换为包含明确文件路径的任务），目的是满足 Spec-Kit 对任务“可立即执行”的要求（每项任务需有单一、明确的文件路径与可操作动作），并在 `specs/003-validate-code-against-constitution/tasks.md` 中记录映射到 `checklists/requirements.md` 的检查项。修改原因：保证后续由 LLM 或开发者逐项执行时无需额外判断。此变更已由 AI 助手应用于仓库任务文件。

- 2025-10-23: 将 `specs/003-validate-code-against-constitution/checklists/requirements.md` 中的每条检查项逐条映射为 `tasks.md` 中的具体任务，并新增映射文件 `specs/003-validate-code-against-constitution/requirements-to-tasks-mapping.md`（由 AI 助手生成）。目的：确保每个检查项都有对应的可执行任务并可被 CI/脚本自动化验证。生成的任务包括 T029..T036。
