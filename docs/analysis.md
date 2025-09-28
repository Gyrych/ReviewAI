# 项目源码全面分析与重构建议（电路评审系统）

本文对仓库的前后端代码进行逐行（关键行聚焦）与分层分析，覆盖架构、功能与设计意图，并从可维护性、可扩展性与可读性角度提出系统性改进方案，重点落实“高内聚、低耦合”“提示词与代码分离”“两种原理图评审模式的完全隔离”。

更新时间：2025-09-28

---

## 目录

1. 仓库结构与技术栈
2. 后端服务 `services/circuit-agent` 分层架构与关键流程
   - 2.1 启动与路由装配（`bootstrap/server.ts`）
   - 2.2 接口层（Interface/HTTP Routes）
   - 2.3 用例层（Application/UseCases）
   - 2.4 领域层（Domain/Contracts）
   - 2.5 基础设施层（Infra/Providers/Stores/Search/HTTP）
3. 前端（`frontend/`）架构与交互流程
4. 设计意图还原与质量评估（可维护性、可扩展性、可读性）
5. 主要问题与风险清单
6. 改进方案（高内聚低耦合、模块化与分层提升）
7. 提示词（Prompts）与代码彻底分离设计
8. 两种评审模式（Direct vs Structured）完全隔离设计
9. 渐进式落地路线图（可执行任务序列）
10. 附录：API 一览、数据契约、时间线语义

---

## 1) 仓库结构与技术栈

顶层结构（精简）：

- `services/circuit-agent/`：独立后端子服务（TypeScript/Node/Express）
- `frontend/`：前端（Vite + React + TypeScript + Tailwind）
- `docs/`：规范与说明（电路 JSON 结构、Overlay 规范、Prompt 改进建议）
- `logo/`、根级 `README*`、启动脚本等

技术栈要点：

- 后端：Express，清晰分层（domain/app/interface/infra/config/bootstrap），依赖注入通过显式构造传参实现
- LLM/视觉：OpenRouter（OpenAI 兼容接口）；文本与多模态分别封装为 `LlmProvider`、`VisionProvider`、`VisionChatProvider`
- 数据存储：文件系统 Artifact/Session；Progress 走 Redis 优先，回退内存
- 前端：React 单页，复用“统一编排端点”实现两模式切换；I18n 本地化；时间线（Timeline）可视化

---

## 2) 后端 `services/circuit-agent` 分层架构与关键流程

分层目录：

- `domain/` 契约与实体（无基础设施依赖）
- `app/` 用例（业务编排）与服务（时间线等）
- `interface/http/` 路由（控制器）与 DTO 粗解析
- `infra/` 适配器（OpenRouter 客户端、Provider、存储、搜索、进度）
- `config/` 配置集中读取
- `bootstrap/` 应用启动与路由装配

这种布局天然支持高内聚低耦合：领域接口稳定向上，基础设施可替换；用例聚合业务流程；控制器仅做 IO 组装。

### 2.1 启动与路由装配（`src/bootstrap/server.ts`）

关键步骤（行号指向核心语义，非逐字符对齐）：

- 31-42：加载配置与全局中间件（JSON 解析、兜底错误）
- 45：健康检查 `GET /health`
- 47-68：静态目录与系统提示词端点 `GET /system-prompt`（从 `ReviewAIPrompt/` 或根级文件兜底读取）
- 70-83：进度存储（优先 Redis，失败回退内存）→ `GET /progress/:id`
- 85-92：直接评审模式（Direct）：文件上传，委派 `DirectReviewUseCase`
- 93-99：结构化识别（Structured/recognize）：固定视觉模型 + 5 轮识别 → `StructuredRecognitionUseCase`
- 100-104：并行文本评审（Structured/review）：多模型文本 LLM → `MultiModelReviewUseCase`
- 105-107：终稿整合（Structured/aggregate）：固定 `openai/gpt-5` → `FinalAggregationUseCase`
- 109-111：统一编排端点 `POST /orchestrate/review`（根据 `directReview` 分支走 Direct 或 Structured 全链）
- 115-121：会话管理 `sessions`（list/load/save/delete）基于文件系统

设计意图：

- 路由工厂与用例实例显式装配，依赖以构造参数注入，便于替换 Provider/Store
- 通过 `TimelineService` 将“可观测进度”写入 `ProgressStore`，与 UI 对齐

### 2.2 接口层（Interface/HTTP Routes）

- `routes/directReview.ts`：
  - 18-41：组装 `ReviewRequest`（files/systemPrompt/requirements/specs/dialog/history/options）
  - 42-55：调用用例并返回；`finally` 清理临时上传文件
- `routes/structuredRecognize.ts`：
  - 16-31：校验 `apiUrl/visionModel`，读取上传为 `Attachment[]`，调用识别用例
- `routes/structuredReview.ts`：
  - 8-21：解析 `models[]/circuit/systemPrompt/...`，调用并行文本评审
- `routes/aggregate.ts`：
  - 13-29：解析 `circuit/reports/systemPrompt` 与可选附件文本，调用最终整合
- `routes/orchestrate.ts`：
  - 23-52：分支（`directReview=true`）直接评审
  - 54-69：结构化流水线：5 轮识别 → 并行文本评审 → 最终整合 → 合并时间线
- `routes/progress.ts`、`routes/sessions.ts`、`routes/health.ts`：进度/会话/健康

观察：DTO 解析基本采用“宽松字符串/JSON.parse”策略，未引入强校验库。

### 2.3 用例层（Application/UseCases）

- `DirectReviewUseCase`：
  - 23-46：构建富消息（system + user 文本 + 图像 data URL）
  - 48-56：写入时间线、调用视觉聊天 Provider、脱敏文本
  - 58-63：保存报告到 Artifact，并回写时间线

- `StructuredRecognitionUseCase`：
  - 24-33：固定 5 轮识别（逐轮时间线）
  - 35-41：结果整合（consolidate）
  - 42-61：可选 datasheet 搜索，写入 `circuit.datasheetMeta`

- `MultiModelReviewUseCase`：
  - 24：统一用户提示载荷（电路 JSON + 需求/规格）
  - 26-35：对 `models[]` 并行发起文本评审，请求/响应写入时间线

- `FinalAggregationUseCase`：
  - 22-29：将 `circuit/reports/attachments` 打包为一个 JSON 文本输入一次性整合

### 2.4 领域层（Domain/Contracts）

- `CircuitGraph`、`Component/Net`、`DatasheetMeta`：统一电路结构数据形态
- `ReviewRequest/ReviewReport`、`TimelineItem`：请求输出与可观测性
- `VisionProvider/LlmProvider/...`：可替换 Provider 契约
- `RichMessage/RichPart`：直接评审需要的多模态消息结构

领域契约不依赖具体基础设施，符合 DDD“内核稳定，对外适配器可替换”的原则。

### 2.5 基础设施层（Infra）

- `infra/http/OpenRouterClient.ts`：统一 POST JSON 与 OpenAI 兼容响应抽取
- Provider：
  - `OpenRouterVisionChat`（多模态聊天，直接评审用）
  - `OpenRouterVisionProvider`（单/多轮识别与整合，结构化识别用）
  - `OpenRouterTextProvider`（文本评审/整合）
- 存储：
  - `ArtifactStoreFs`（工件文件写入，URL 映射为静态路径）
  - `SessionStoreFs`（会话 JSON）
  - `ProgressMemoryStore/ProgressRedisStore`（时间线持久）
- 搜索：`DuckDuckGoHtmlSearch`（无 key HTML 解析，失败回退代理）

---

## 3) 前端（`frontend/`）架构与交互流程

- `App.tsx`：全局配置（模型 API、模型名、API Key、主题与语言、会话管理），右侧 `ResultView` 展示
- `ReviewForm.tsx`：
  - 单一提交入口指向后端编排端点 `/api/v1/circuit-agent/orchestrate/review`
  - 前置获取系统提示词 `GET /system-prompt?lang=...` 并与本地 `requirements/specs` 合并（作为 `systemPrompts` 附带）
  - `directReview` 开关控制两模式；`multiPassRecognition/enableSearch` 为结构化链路参数
  - 生成并轮询 `progressId`，将后端时间线合并进本地时间线
  - 收到结果后拆分“问题确认/评审报告”，分页展示与历史积累
- `ResultView.tsx`：Markdown 渲染、可选 Overlay（SVG + mapping）与时间线简版展示
- `FileUpload.tsx`：文件选择与预览（图片优先）
- `i18n.tsx`：轻量字典，缺失 key 记录 warn

交互意图：

- 前端仅调用“统一编排端点”，后端依据开关与参数决定走何种模式与流水线深度
- 通过 `timeline` 实现用户可感知的多阶段反馈与调试

---

## 4) 设计意图与质量评估

### 4.1 设计意图（推断）

- 后端严格分层，保证可替换 Provider 与易于扩展的用例编排
- 将“直接评审”与“结构化识别+多阶段评审”以并行子系统实现，并通过编排端点统一入口
- 以文件系统快速落盘工件，前端可回看；时间线统一抽象便于观测与复盘

### 4.2 可维护性

- 优点：
  - 分层清晰，依赖注入显式，可替换性强
  - 类型定义集中在 `domain/contracts`，接口稳定
  - 路由工厂 + 用例编排降低控制器复杂度
- 待提升：
  - 控制器层缺少强 DTO 校验（Zod/Yup/valibot），解析失败与错误分类不够
  - 提示词散落（部分内联、部分文档化），缺少统一加载/版本控制
  - 时间线 step 命名不完全规范（前后端命名空间不统一，易混淆）

### 4.3 可扩展性

- 优点：Provider/Store 可替换；新模式可增设独立用例与路由
- 待提升：
  - Prompt 策略不可配置（缺分层），不同模式/语言/供应商的提示词难以演进
  - 缺少“流水线插件机制”，多阶段识别/搜集/聚合的拓展点应标准化

### 4.4 可读性

- 优点：中文注释详尽，函数短小、命名清晰
- 待提升：
  - 少量“字符串拼接提示词”应迁移到模板与外部文件
  - 时间线与工件键名需统一风格

---

## 5) 主要问题与风险清单

1. 提示词未完全外置：多处内联（特别是 `OpenRouterVisionProvider` 的 system 内容、consolidation 提示）
2. DTO 校验缺失：不合法 `models/circuit/files` 等可能导致上游报错后仅返回 502
3. 时间线语义漂移：`vision.* / llm.* / backend.* / frontend.*` 混用，需命名空间化
4. 模式边界不够“硬”：统一编排端点虽便捷，但 Direct 与 Structured 的状态工件、目录与进度命名未完全隔离
5. 工件目录无分租：两模式工件存于同一 `artifacts/` 目录，溯源不便

---

## 6) 改进方案（高内聚低耦合、模块化与分层提升）

### 6.1 分层强化与模块边界

- 领域层：
  - 引入 `PromptKey`/`PromptBundle` 类型（system、vision.singlePass、vision.consolidation、text.multiReview、text.finalAggregate 等）
  - 定义 `Mode` 与 `PipelineStage` 枚举，标准化时间线分类
- 应用层：
  - 引入 `Pipeline` 抽象（`execute(context): Result`），将“识别→评审→整合”拆分为可组合阶段
  - 时间线写入统一通过 `TimelineService` 的语义方法（如 `llmRequest`, `visionPassStart`）
- 接口层：
  - 使用 Zod/Valibot 定义 DTO schema + `safeParse`，响应 400/422 与错误细节
  - 将 `orchestrate` 仅做编排路由，杜绝模式内部细节泄漏
- 基础设施层：
  - 新增 `PromptRepositoryFs`（见 7）
  - Provider 配置化（API base、超时、重试、限速）
- 存储与工件：
  - 工件根目录按 `mode/yyyy-mm-dd/` 分桶；文件名包含 `progressId`/`stage`

### 6.2 时间线（Timeline）规范化

- 命名空间：`direct.*`、`structured.*`、`vision.*`、`llm.*`、`search.*`、`backend.*`、`frontend.*`
- 关键阶段：
  - 识别：`vision.pass.request/response`、`structured.consolidation.start/done`
  - 评审：`llm.parallel_review.request/response`、`llm.final_aggregate.request/response`
  - 搜索：`search.datasheet.done`
- 工件引用字段统一为 `artifacts.{request|response|parsed|finalCircuit|overlay|...}`

---

## 7) 提示词（Prompts）与代码彻底分离设计

目标：将所有提示词外置到文件或模板，按“模式/阶段/语言/供应商”维度组织，运行期由仓库加载与缓存，代码仅持有 `PromptKey`。

### 7.1 目录与命名建议

- 根级或子服务级统一目录（推荐根级）：`ReviewAIPrompt/`
  - `system/`
    - `zh/SystemPrompt.md`（或 `系统提示词.md`）
    - `en/SystemPrompt.md`
  - `direct/`
    - `system.md`（Direct 模式专用）
  - `structured/`
    - `vision_single_pass.md`
    - `vision_consolidation.md`
    - `text_multi_review.md`
    - `text_final_aggregate.md`
  - `meta/prompts.json`（索引、版本、说明）

环境变量：`PROMPT_DIR` 指向根目录（缺省为仓库根的 `ReviewAIPrompt/`）。

### 7.2 PromptRepository（加载与缓存）

职责：

- 根据 `PromptKey`（如 `structured.vision_single_pass@en`）解析到文件路径并读取内容
- 缓存热读、文件变更自动失效（可选）
- 读取失败提供可控降级（返回简化提示或明确 500）

接口草案：

```
interface PromptRepository {
  load(key: PromptKey): Promise<string>
}

type PromptKey =
  | { mode: 'direct', stage: 'system', lang: 'zh'|'en' }
  | { mode: 'structured', stage: 'vision_single_pass'|'vision_consolidation'|'text_multi_review'|'text_final_aggregate', lang?: 'zh'|'en' }
```

### 7.3 代码改造要点

- `OpenRouterVisionProvider.recognizeSingle`：
  - 移除内联 `system` 内容，改为 `promptRepo.load({ mode:'structured', stage:'vision_single_pass' })`
- `OpenRouterVisionProvider.consolidate`：
  - 外置合并提示词
- `MultiModelReviewUseCase` / `FinalAggregationUseCase`：
  - `systemPrompt` 由前端/后端统一注入（优先外置），代码仅传递
- `DirectReviewUseCase`：
  - `system` 作为 Direct 专用提示词来源（可按语言切换）

### 7.4 版本与可观测性

- 在时间线与响应中附加 `promptVersion`（来自 `meta/prompts.json`），便于回溯
- 若提示词缺失：
  - system：返回 503 + 说明或降级提示（前端已做非阻断告警）
  - specialized：严格失败（以免结构化解析走样）

---

## 8) 两种评审模式完全隔离设计

目标：业务、工件、时间线、提示词、会话、配置实现全维度的“逻辑隔离”。

### 8.1 业务隔离

- 路由：保留 `/modes/direct/*` 与 `/modes/structured/*`；`/orchestrate/review` 仅作为分发入口
- 用例：Direct 与 Structured 各自单独用例，不共享内部状态或缓存

### 8.2 数据与工件隔离

- 目录：`artifacts/direct/...` 与 `artifacts/structured/...`
- 时间线 step 前缀：`direct.*` vs `structured.*`（附带 `vision.*`、`llm.*` 子类）
- 会话文件：持久化 `mode` 字段，便于前端过滤

### 8.3 提示词与配置隔离

- `ReviewAIPrompt/direct/...` 与 `ReviewAIPrompt/structured/...` 独立
- `config` 支持按模式读取不同默认模型与超时（例如 Direct 使用多模态聊天，Structured 拆分视觉与文本）

### 8.4 前端交互隔离（不破坏现有统一入口）

- `ReviewForm` 保持 `directReview` 开关；但 UI 文案与时间线标签基于模式切换（例如徽章/颜色）
- 会话保存时写入 `mode`，加载时按模式选择默认参数与视图

---

## 9) 渐进式落地路线图（建议 2–3 个迭代）

迭代一（架构基线）：

1. 引入 `PromptRepositoryFs`，将 vision/consolidation 提示词外置，保留 system 端点
2. 统一时间线命名空间（不改业务逻辑）
3. 工件目录分桶（`artifacts/{mode}/...`），响应体携带 `artifactBase`

迭代二（模式隔离与校验）：

4. 路由/会话按 `mode` 标记；前端保存/加载透传 mode
5. 接口层引入 Zod/Valibot 校验，错误码与消息标准化
6. Provider 超时/重试/限速通过 `config` 配置

迭代三（可观测与产品完善）：

7. 时间线语义方法化（`TimelineService` 增加专用 maker）
8. 响应体输出 `promptVersion` 与关键 promptKey，便于复现
9. 文档化与脚本：`ReviewAIPrompt/` 模板与校验脚本

---

## 10) 附录

### 10.1 API 一览（后端 v1）

- Base: `/api/v1/circuit-agent`
- 健康：`GET /health`
- 进度：`GET /progress/:id`
- 直接评审：`POST /modes/direct/review` (multipart)
- 结构化：
  - 识别：`POST /modes/structured/recognize` (multipart)
  - 并行评审：`POST /modes/structured/review` (json)
  - 最终整合：`POST /modes/structured/aggregate` (multipart)
- 统一编排：`POST /orchestrate/review` (multipart)
- 会话：`POST /sessions/save`、`GET /sessions/list|:id`、`DELETE /sessions/:id`
- 系统提示词：`GET /system-prompt?lang=zh|en`

### 10.2 数据契约（节选）

- `CircuitGraph`：`components[]` + `nets[]` + `metadata?` + `datasheetMeta?`
- `ReviewRequest`：`files?` + `systemPrompt` + `requirements?` + `specs?` + `history?` + `options?`
- `ReviewReport`：`markdown` + `timeline[]` + `enriched?`

### 10.3 时间线语义（建议版）

- `frontend.*`：UI 本地步骤
- `backend.*`：后端接收/解析
- `vision.*`：视觉识别阶段（可含 passNumber）
- `structured.*`：结构化流程（consolidation 等）
- `llm.*`：文本模型阶段（parallel_review/final_aggregate）
- `search.*`：资料检索

---

## 结语

当前代码已具备清晰分层与良好扩展点。通过提示词外置、DTO 强校验、时间线规范化与模式全隔离，可以显著提升系统的可维护性与长期演进能力。建议按“提示词外置 → 时间线规范 → 模式隔离 → 校验强化”的顺序迭代推进。

