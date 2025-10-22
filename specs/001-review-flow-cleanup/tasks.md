---
title: Review Flow Cleanup and Pipeline Assurance — tasks
description: Dependency-ordered, parallelizable implementation tasks organized by user story
---

Feature: 001-review-flow-cleanup
Feature Dir: E:\05_selfplace\10_ReviewAI\specs\001-review-flow-cleanup
Available Docs: plan.md, spec.md, data-model.md, contracts/openapi.yaml, research.md, quickstart.md

## Phase 1 — Setup（项目初始化）

Goal: 启动环境、核对关键提示词与基础配置，确保可以运行端到端调用。
Independent Test: 可通过运行 `E:\05_selfplace\10_ReviewAI\start-all.js` 启动服务，并用 `quickstart.md` 中的 curl 成功拿到 200 响应与 timeline。

- [X] T001 使用 Node 启动服务 `E:\05_selfplace\10_ReviewAI\start-all.js`
- [ ] T002 [P] 核对系统提示词存在且非空 `E:\05_selfplace\10_ReviewAI\ReviewAIPrompt\circuit-agent\system_prompt_initial_zh.md`
- [ ] T003 [P] 核对系统提示词存在且非空 `E:\05_selfplace\10_ReviewAI\ReviewAIPrompt\circuit-agent\system_prompt_initial_en.md`
- [ ] T004 [P] 核对修订提示词存在且非空 `E:\05_selfplace\10_ReviewAI\ReviewAIPrompt\circuit-agent\system_prompt_revision_zh.md`
- [ ] T005 [P] 核对修订提示词存在且非空 `E:\05_selfplace\10_ReviewAI\ReviewAIPrompt\circuit-agent\system_prompt_revision_en.md`
- [X] T006 [P] 核对识别轮提示词存在且非空 `E:\05_selfplace\10_ReviewAI\ReviewAIPrompt\circuit-agent\identify_prompt_zh.md`
- [X] T007 [P] 核对检索/摘要提示词存在且非空 `E:\05_selfplace\10_ReviewAI\ReviewAIPrompt\circuit-agent\search_prompt_zh.md`
- [X] T008 核对存储根读取逻辑（STORAGE_ROOT） `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\bootstrap\server.ts`
- [X] T009 核对 artifacts 静态与列表路由注册 `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\bootstrap\server.ts`

## Phase 2 — Foundational（所有用户故事的前置能力）

Goal: 保证后端编排、存储与前端参数透传的基础能力完整且一致。
Independent Test: 访问 `/health`、`/artifacts` 列表成功；前端表单包含 `enableSearch`、`language` 并能提交。

- [X] T010 编排路由可用且导出 `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\interface\http\routes\orchestrate.ts`
- [X] T011 直评用例存在并可被调用 `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\app\usecases\DirectReviewUseCase.ts`
- [X] T012 [P] 识别轮用例存在并输出关键词 `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\app\usecases\IdentifyKeyFactsUseCase.ts`
- [X] T013 [P] 在线检索 provider 与摘要能力存在 `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\infra\search\OpenRouterSearch.ts`
- [X] T014 [P] 工件存储实现存在 `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\infra\storage\ArtifactStoreFs.ts`
- [X] T015 [P] 会话存储实现存在 `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\infra\storage\SessionStoreFs.ts`
- [X] T016 前端评审表单透传 enableSearch `E:\05_selfplace\10_ReviewAI\frontend\src\components\ReviewForm.tsx`
- [X] T017 [P] 电路页代理类表单透传 enableSearch `E:\05_selfplace\10_ReviewAI\frontend\src\agents\circuit\ReviewForm.tsx`
- [X] T018 [P] 电路精细页代理类表单透传 enableSearch `E:\05_selfplace\10_ReviewAI\frontend\src\agents\circuit-fine\ReviewForm.tsx`

## Phase 3 — User Story 1（P1）：初始评审与可选检索

Story Goal: 用户上传图片/PDF 与文本，系统在初始/修订判定为首轮的情况下，合并上下文、（可选）执行识别→检索→逐 URL 摘要→作为 system 注入，下发 Markdown 评审与 timeline。
Independent Test: 依据 `quickstart.md` 的两条 curl（enableSearch=false / true）均返回 200；开启检索时 `searchSummaries` 至少含 1 条且 timeline 含 identify/search/summary。

- [X] T019 [US1] 检查与完善 enableSearch 参数处理 `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\interface\http\routes\orchestrate.ts`
- [X] T020 [P] [US1] 识别结果→关键词去重与过滤 `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\app\usecases\IdentifyKeyFactsUseCase.ts`
- [X] T021 [P] [US1] 逐关键词在线检索与摘要注入 `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\infra\search\OpenRouterSearch.ts`
- [X] T022 [US1] 将合格摘要注入 system 并参与直评 `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\app\usecases\DirectReviewUseCase.ts`
- [X] T023 [P] [US1] timeline 写入 identify/search/query/hit/summary `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\app\usecases\DirectReviewUseCase.ts`
- [X] T024 [P] [US1] 保存请求/响应与摘要为 artifacts `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\infra\storage\ArtifactStoreFs.ts`
- [X] T025 [US1] 前端表单新增/透传 enableSearch（若缺失则补齐） `E:\05_selfplace\10_ReviewAI\frontend\src\components\ReviewForm.tsx`
- [X] T026 [P] [US1] 电路/精细代理页同步 enableSearch（若缺失则补齐） `E:\05_selfplace\10_ReviewAI\frontend\src\agents\circuit\ReviewForm.tsx`
- [X] T027 [P] [US1] 电路/精细代理页同步 enableSearch（若缺失则补齐） `E:\05_selfplace\10_ReviewAI\frontend\src\agents\circuit-fine\ReviewForm.tsx`
- [X] T028 [US1] 工具化验证（禁用检索） `E:\05_selfplace\10_ReviewAI\specs\001-review-flow-cleanup\quickstart.md`
- [X] T029 [P] [US1] 工具化验证（启用检索） `E:\05_selfplace\10_ReviewAI\specs\001-review-flow-cleanup\quickstart.md`

## Phase 4 — User Story 2（P1）：无限修订回路

Story Goal: 若 `history` 中包含 assistant 报告或修订标记，系统加载修订提示词并返回修订版 Markdown，可无限次迭代。
Independent Test: 首轮后带入 `history` 与新对话；多次重复均得到不同修订报告与正确修订提示词。

- [X] T030 [US2] 收紧修订判定：仅 assistant/报告标记触发 `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\interface\http\routes\orchestrate.ts`
- [X] T031 [P] [US2] 修订提示词加载与容错（缺失时 500） `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\infra\prompts\PromptLoader.ts`
- [X] T032 [P] [US2] 双语支持：language=zh|en 正确选择变体 `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\infra\prompts\PromptLoader.ts`
- [X] T033 [US2] 工具化验证：带入上一轮 assistant 与新对话 `E:\05_selfplace\10_ReviewAI\specs\001-review-flow-cleanup\quickstart.md`

## Phase 5 — User Story 3（P2）：会话与工件

Story Goal: 支持保存/列表/加载会话；请求/响应、检索轨迹与摘要作为 artifacts 暴露静态与列表接口。
Independent Test: 完成一次评审后保存会话并列出；加载会话可见历史与 artifacts；访问 `/artifacts` 与单个 artifact 成功。

- [X] T034 [US3] 会话 API（list/load/save/delete）可用 `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\interface\http\routes\sessions.ts`
- [X] T035 [P] [US3] 会话文件存储实现可写可读 `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\infra\storage\SessionStoreFs.ts`
- [X] T036 [P] [US3] artifacts 列表与静态访问可用 `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\bootstrap\server.ts`
- [X] T037 [US3] 工具化验证：列出与获取 artifacts `E:\05_selfplace\10_ReviewAI\specs\001-review-flow-cleanup\quickstart.md`

## Final Phase — Polish & Cross-Cutting（收尾与跨切）

Goal: 文档与双语 README 一致；错误信息明晰；默认参数与超时策略落地。
Independent Test: 按 README 步骤从零跑通，界面术语与文档一致；错误路径可读。

- [X] T038 对齐 README 关键端点与基路径 `E:\05_selfplace\10_ReviewAI\README.md`
- [X] T039 [P] 对齐中文 README 关键端点与基路径 `E:\05_selfplace\10_ReviewAI\README.zh.md`
- [X] T040 [P] 校对前端 i18n 字段与 UX 文案 `E:\05_selfplace\10_ReviewAI\frontend\src\i18n.tsx`
- [X] T041 差错路径信息与日志可读性核对 `E:\05_selfplace\10_ReviewAI\services\circuit-agent\src\interface\http\routes\orchestrate.ts`
- [X] T042 [P] 对齐 OpenAPI 契约与实现（路由/参数/响应） `E:\05_selfplace\10_ReviewAI\specs\001-review-flow-cleanup\contracts\openapi.yaml`

---

## 依赖关系（用户故事完成顺序）

1) US1 → 2) US2 → 3) US3（US2 依赖首轮产物，US3 可在 US1 后并行推进）

## 并行执行建议（示例）

- US1：T020、T021、T023、T024、T026、T027、T029 可并行（互不修改相同文件）。
- US2：T031、T032 可并行；完成后再做 T033。
- US3：T035、T036 可并行；完成后做 T034、T037。

## 实施策略

MVP：仅交付 US1（初始评审 + 可选检索）即可形成可演示价值；随后增量实现 US2 的修订闭环与 US3 的会话/工件，以缩短首轮价值交付时间。

---

## 报告

- 输出路径：`E:\05_selfplace\10_ReviewAI\specs\001-review-flow-cleanup\tasks.md`
- 任务总数：42
- 各用户故事任务数：US1=11，US2=4，US3=4（不含 Setup/Foundational/Polish）
- 并行机会：US1(7)，US2(2)，US3(2)
- 独立测试标准：已在各 Phase 标注
- 建议 MVP 范围：仅 US1
- 格式校验：所有任务均符合 `- [ ] T### [P]? [US?] 描述 + 绝对路径`
