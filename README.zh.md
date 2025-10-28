# ReviewAI

本项目为本地开发的 AI 辅助电路原理图评审骨架：图片 → 结构化电路 JSON → LLM 生成 Markdown 评审报告，并在前端以 SVG overlay 进行人工复核。

仓库包含一个 Vite/React 前端和两个后端子服务（`circuit-agent` 与 `circuit-fine-agent`），实现图像解析、多轮识别与 LLM 评审/整合。

重要：运行时要求 `ReviewAIPrompt/` 下存在一组提示词文件（见“提示词”一节）。缺失提示词会导致后端 fail-fast。项目当前默认采用单轮（single-shot）评审模式；旧的多轮实现已退役并计划移除，详情见 `specs/005-single-shot-search-summary/removal_plan.md`。

前置条件
- Node.js >= 18
- 可选：Docker（用于 Redis）

快速开始（开发）

1. 启动所有服务（跨平台）

```bash
node start-all.js
```

2. 或分服务启动

```bash
cd services/circuit-agent
npm install
npm run dev

cd ../circuit-fine-agent
npm install
npm run dev

cd ../../frontend
npm install
npm run dev
```

默认开发时 frontend 代理到后端：
- `circuit-agent`: http://localhost:4001
- `circuit-fine-agent`: http://localhost:4002

提示词
-----

运行时要求提示词文件按 agent 存放在 `ReviewAIPrompt/` 目录，代码会以 `ReviewAIPrompt/{agent}/{filename}` 路径加载，缺失或为空文件会导致服务返回 500 错误。

最低要求（仓库中含示例）：

- `ReviewAIPrompt/circuit-agent/system_prompt_initial_zh.md`
- `ReviewAIPrompt/circuit-agent/system_prompt_initial_en.md`
- `ReviewAIPrompt/circuit-agent/system_prompt_revision_zh.md`
- `ReviewAIPrompt/circuit-agent/system_prompt_revision_en.md`
- `ReviewAIPrompt/circuit-fine-agent/system_prompt_zh.md`
- `ReviewAIPrompt/circuit-fine-agent/system_prompt_en.md`
- `ReviewAIPrompt/circuit-fine-agent/macro_prompt.md`, `ic_prompt.md`, `rc_prompt.md`, `net_prompt.md`, `verify_prompt.md`, `consolidation_prompt.md`
 - `ReviewAIPrompt/circuit-agent/search_prompt.md`
 - `ReviewAIPrompt/circuit-agent/summary_prompt.md`

模型说明
------

本应用区分两类模型角色；当 `enableSearch=true` 时，编排器默认采用“单次请求（single-shot）检索+摘要”流程：

- **主模型**：用于视觉识别与最终评审/报告生成。由顶部第一行 `model` 下拉配置，并随会话保存为 `model` 字段。
- **副模型**：用于检索。开启 `enableSearch=true` 后端会发起一次上游调用，在一次推理中完成检索→去重→整合，并返回合并后的摘要与 `citations`；由 `auxModel` 选择器配置并随 `/orchestrate/review` 提交。时间线会记录 `search.single_shot.request/response` 与 `search_trace_summary` 工件。

架构概览
-------

- `frontend/` — Vite + React + TypeScript。Agent 选择与 API 配置在 App 级维护，两个 agent 表单在 `frontend/src/agents/` 下。
- `services/circuit-agent/` — 主后端微服务，目录结构：
  - `app/usecases` — 业务用例（`DirectReviewUseCase`、`StructuredRecognitionUseCase`、`MultiModelReviewUseCase`、`FinalAggregationUseCase`）。
  - `infra` — 提供者、提示词加载、HTTP 客户端（OpenRouter 兼容）、存储、进度存储实现。
  - `interface/http/routes` — express 路由（`orchestrate`、`directReview`、`structuredRecognize`、`structuredReview`、`aggregate`、`sessions`、`progress`、`health`）。
- `services/circuit-fine-agent/` — 用于精细/电路图评审（委员会架构）工作流的并行服务，结构与 `circuit-agent` 一致，遵循相同的 `PromptLoader` 约定。

关键接口（circuit-agent）
- `GET /health` — 健康检查
- `GET /progress/:id` — 进度
- `GET /artifacts/:filename` — 静态工件
- `GET /system-prompt?lang=zh|en` — 获取系统提示词
- `POST /orchestrate/review` — 统一编排；当 `directReview=true` 时直接走直评模式（图片→LLM 评审），否则走结构化识别 + 并行评审 + 整合流程。
  - 直评模式下当 `enableSearch=true` 时，后端执行 识别→检索→逐URL摘要 流程，并对关键词与 URL 去重；摘要默认≤1024词并要求结构化要点。若摘要文本命中失败短语或过短（<50字），记录为 `search.summary.failed` 而不注入。时间线会包含 `search.llm.request/response`（带正文片段与完整工件）。响应体同时返回 `searchSummaries: string[]`（与注入的 `extraSystems` 同源），前端可兜底展示。为避免重复检索，编排阶段完成检索后会在直评用例中显式禁用二次检索。
- `POST /modes/structured/recognize` — 结构化识别
- `POST /modes/structured/review` — 多模型评审
- `POST /modes/structured/aggregate` — 最终整合
- 会话管理：`POST /sessions/save`、`GET /sessions/list`、`GET /sessions/:id`、`DELETE /sessions/:id`

运行时重要行为
- `PromptLoader`（两个子服务）会强制校验提示词文件存在且非空，支持缓存与预热。
- `orchestrate` 路由会根据 `history` 自动判断是否为修订轮，并选择 `system_prompt_initial` 或 `system_prompt_revision`。
- `DirectReviewUseCase` 会构建富消息（system + user parts），在 `enableSearch=true` 时：
  - 先执行“识别轮”抽取关键元器件与技术路线清单
  - 对每个关键词进行在线检索并逐 URL 生成 ≤512 词摘要，各自注入一条 system 消息
  - 附件会被转换为 data URL 发送给上游视觉 LLM
  - 请求/响应完整 JSON 会以 artifact 形式保存便于回溯。
  - orchestration 会在 JSON 响应中镜像这些摘要到 `searchSummaries`，作为前端兜底数据源。
- 工件存储为文件系统实现（`ArtifactStoreFs`），每个服务将其工件放在自身的 storage 根目录下并通过 `/artifacts` 暴露。

配置与环境变量
- `PORT` — 服务端口（默认 4001/4002）
- `OPENROUTER_BASE` — 上游模型提供者基地址（OpenRouter 兼容）
- `REDIS_URL` — 可选的 Redis 进度存储
- `LLM_TIMEOUT_MS`, `VISION_TIMEOUT_MS`, `FETCH_RETRIES`, `KEEP_ALIVE_MSECS` — 网络与超时相关配置

安全与隐私
- 服务会尽量避免在日志中记录敏感授权头，但出于调试需要会保存完整的 LLM 请求/响应工件；在共享或生产环境中请谨慎处理 artifacts。

前端 API Key 行为

- 前端会将 API Key 保存在浏览器的 `localStorage`（键名 `apiKey`）并在应用启动时自动加载；在右上角的 API Key 输入框修改后会立即更新 `localStorage`，以便同一浏览器会话中不同 agent 共享同一 Key。
- 安全提示：Key 以明文保存在浏览器本地存储。在共享计算机或公开环境中请勿保存敏感 Key，或使用浏览器私有模式并在使用后清除本地存储。

许可证
- MIT（见 `LICENSE` 文件）

故障排查
- 出现 `Failed to load system prompt` 错误：确认 `ReviewAIPrompt/{agent}/` 下是否存在且非空的提示词文件。
- 前端无法在开发模式中访问后端：确认服务已在 4001/4002 端口运行，并检查 `frontend/src/App.tsx` 中的 AGENTS baseUrl 配置（DEV 模式下指向 `http://localhost:4001` / `4002`）。
 - 若启用搜索但“检索摘要”面板为空：确认上游允许 `web` 插件用于抓取/摘要；前端同时会从响应体的 `searchSummaries` 兜底显示，避免仅依赖 artifact 下载。

联系方式
- 项目维护者: gyrych@gmail.com
