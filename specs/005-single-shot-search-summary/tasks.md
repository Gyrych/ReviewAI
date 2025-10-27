---
description: 该文档为“单次交互的搜索轮与摘要轮”功能生成的可执行任务清单（按依赖排序）
---

# 单次交互的“搜索+摘要”功能任务清单（中文）

功能目录：`specs/005-single-shot-search-summary`

阶段结构：

- 第 1 阶段：环境准备（Setup）

- 第 2 阶段：基础能力（Foundational）

- 第 3 阶段：用户故事（按优先级）

- 终期阶段：完善与跨切关注点（Polish & cross-cutting）

说明：

- 所有任务均遵循 Spec-Kit 要求的清单格式；每个任务包含文件路径和预期产物位置，便于直接执行。

- 所有路径均相对于仓库根。若任务已完成，请在相应行将 `- [ ]` 改为 `- [X]`。

## 第 1 阶段 — 环境准备

 - [ ] T001 创建 `specs/005-single-shot-search-summary/tasks.md`（基于模板 `.specify/templates/tasks-template.md`）并放置在 `specs/005-single-shot-search-summary/tasks.md`

- [ ] T002 [P] 在 `services/circuit-agent/src/infra/prompts/PromptLoader.ts` 中验证并调用提示词预热检查（PromptLoader.preloadPrompts），确保在启动前校验所有必需提示词。

- [ ] T003 验证 OpenAPI 契约文件 `specs/005-single-shot-search-summary/contracts/openapi.yaml` 的存在性与 schema 完整性（契约路径：`specs/005-single-shot-search-summary/contracts/openapi.yaml`）

- [ ] T004 在 `scripts/backup/backup_multi_round.ps1` 中创建并测试备份脚本以保存旧多轮数据，预期输出目录 `specs/005-single-shot-search-summary/backups/` 下生成 `backup_*.tar.gz`

- [ ] T031 验证备份结果完整性并生成回滚脚本 `specs/005-single-shot-search-summary/migrations/rollback_multi_round.ps1`

## 第 2 阶段 — 基础能力（阻塞项）

 - [ ] T005 [P] 在 `specs/005-single-shot-search-summary/migrations/001_create_citation_table.sql` 中实现 `Citation` 数据表的迁移脚本（包含字段、索引建议）

- [ ] T006 [P] 在 `specs/005-single-shot-search-summary/migrations/002_create_annotated_message_table.sql` 中实现 `AnnotatedMessage` 数据表的迁移脚本

- [ ] T032 在 `specs/005-single-shot-search-summary/migrations/003_indexes_and_fks.sql` 中为 `Citation` 与 `AnnotatedMessage` 添加索引与外键约束（便于审计与回溯）

 - [ ] T007 [P] 在 `services/circuit-agent/src/config/defaults.ts` 中添加 `RoundConfig` 的默认配置（enable_search, engine=auto, max_results=5, context_scale=high 等）

- [ ] T008 [P] 在 `services/circuit-agent/src/storage/artifactStoreFs.ts` 中创建用于保存原始模型响应的存储适配器（artifact store）

- [ ] T009 在 `scripts/check-contract-implementation.js` 中注册并调用契约一致性检查，用于 CI 校验

## 第 3 阶段 — 用户故事（按优先级）

### US1（P1）— 单轮完成“搜索+摘要”（后端实现）

- [ ] T010 [US1] 在 `services/circuit-agent/src/models/citation.ts` 中实现 `Citation` 模型

- [ ] T011 [US1] 在 `services/circuit-agent/src/models/annotatedMessage.ts` 中实现 `AnnotatedMessage` 模型

- [ ] T012 [US1] 在 `services/circuit-agent/src/services/responseParser.ts` 中实现解析器，将模型响应中的标准化引用解析为 `Citation` 实体

- [ ] T013 [US1] 在 `services/circuit-agent/src/routes/search-summary.ts` 中实现单次调用编排逻辑，调用 OpenRouter（含 online/web 插件），解析并保存响应

- [ ] T014 [US1] 使用 `services/circuit-agent/src/storage/artifactStoreFs.ts` 将原始响应保存到 `storage/artifacts/`

- [ ] T015 [US1] 在 `services/circuit-agent/src/services/storageService.ts` 中保存 `AnnotatedMessage` 与 `Citation` 记录到数据库


- [ ] T016 [US1] 在 `services/circuit-agent/src/services/metrics.ts` 中添加观测指标/日志（`search_summary.request_count`, engine, max_results, context_scale）

- [ ] T033 [US1] 为 `responseParser` 添加单元测试 `services/circuit-agent/tests/responseParser.unit.spec.ts`

### US2（P1）— 前端同时展示摘要与引用

 - [ ] T017 [P] [US2] 在 `frontend/src/utils/api.ts` 中更新 API 客户端以支持 `citations` 字段

- [ ] T018 [P] [US2] 在 `frontend/src/components/ResultCard.tsx` 中更新结果卡片组件，以域名样式渲染可点击的引用链接

- [ ] T019 [P] [US2] 在 `frontend/src/styles/result-card.css` 中添加引用列表样式

- [ ] T020 [US2] 在 `specs/005-single-shot-search-summary/quickstart.md` 中更新手动验证步骤以引用新的 endpoint

- [ ] T034 [US2] 在 `frontend/tests/integration/searchSummary.spec.ts` 中添加自动化前端集成测试，验证 `citations` 渲染与链接行为

### US3（P2）— 自动引擎选择与可控上下文规模/结果数

- [ ] T021 [US3] 在 `services/circuit-agent/src/services/engineSelector.ts` 中实现引擎选择逻辑（auto → native → exa）

- [ ] T022 [US3] 在 `services/circuit-agent/src/routes/search-summary.ts` 中透传并在 `services/circuit-agent/src/validators/roundConfigValidator.ts` 中校验 `max_results` 与 `context_scale`

- [ ] T023 [US3] 在 `services/circuit-agent/src/config/defaults.ts` 与 `services/circuit-agent/src/middleware/roundConfigMiddleware.ts` 中增加默认值与请求级覆盖支持

### US4（P3）— 健壮错误处理与重试

- [ ] T024 [US4] 在 `services/circuit-agent/src/utils/retry.ts` 中实现 provider 错误的重试一次策略并在编排器中使用

- [ ] T025 [US4] 在 `services/circuit-agent/src/routes/search-summary.ts` 中补充失败场景的清晰错误响应与日志格式

- [ ] T026 [US4] 在 `services/circuit-agent/tests/search-summary.integration.spec.ts` 中添加集成测试以模拟提供方不支持在线搜索的情况

- [ ] T035 [US4] 为 `engineSelector` 和 `retry` 工具添加单元测试（`services/circuit-agent/tests/engineSelector.unit.spec.ts`、`services/circuit-agent/tests/retry.unit.spec.ts`）

## 终期阶段 — 完善与跨切关注点

- [ ] T027 在 `services/*` 与 `frontend/*` 中识别并移除旧多轮实现路径，编写移除计划 `specs/005-single-shot-search-summary/removal_plan.md`

- [ ] T028 更新仓库根及服务级 README (`README.md`, `README.zh.md`) 以记录单轮模式的行为与配置说明

- [ ] T036 在 CI 工作流（`.github/workflows/ci.yml` 或 `ci/checks.yml`）中添加门控脚本：`npm run check:prompts`、`npm run check:contract`、`npm run check:comments`

- [ ] T029 在 `specs/005-single-shot-search-summary/migrations/` 中添加研究文档中提到的迁移与回滚脚本

 - [ ] T030 [P] 在 `specs/005-single-shot-search-summary/quickstart.md` 中添加快速本地验证步骤并标注可并行验证点

- [ ] T037 [P] 将前端任务及迁移脚本标记为可并行（在本文件中为 T017,T018,T019,T005,T006,T008 添加 `[P]` 标识）

## 新增任务（回滚/迁移/保护/复核）

- [ ] T038 [P1] 编写并验证用于删除旧多轮实现的可回放迁移脚本（路径：`specs/005-single-shot-search-summary/migrations/`），并输出回放说明文档。
- [ ] T039 [P1] 计划并执行回滚验证窗口（建议 24 小时），包含演练步骤、回滚验证检查项与验收标准（输出：`specs/005-single-shot-search-summary/migrations/rollback_playbook.md`）。
- [ ] T040 [P1] 实现请求级超时保护中间件（`services/circuit-agent/src/middleware/timeoutMiddleware.ts`），并在配置中暴露 soft/hard 超时参数。
- [ ] T041 [P1] 实现成本/预算保护模块（`services/circuit-agent/src/services/budgetControl.ts`），包含实时消耗监控与触发限流/告警接口。
- [ ] T042 [P1] 为超时与预算保护编写集成测试与回归测试（`services/circuit-agent/tests/`）。
- [ ] T043 [P1] 设计并实现人工复核队列（`services/circuit-agent/src/services/reviewQueueService.ts`），包含入列、分配、状态机与审计字段。
- [ ] T044 [P2] 实现复核队列通知机制（邮件/Webhook/消息中心）（`services/circuit-agent/src/infra/notifications/`）。
- [ ] T045 [P2] 实现复核队列权限控制（RBAC/角色验证）（`services/circuit-agent/src/middleware/authorization.ts`）。
- [ ] T046 [P1] 实现删除请求的验证逻辑（权限与合法性校验）（`services/circuit-agent/src/validators/deleteValidator.ts`）。
- [ ] T047 [P1] 实现删除前的依赖/影响检查模块（`services/circuit-agent/src/services/predeleteChecker.ts`）。
- [ ] T048 [P1] 实现删除执行器与日志记录（`services/circuit-agent/src/services/deleteExecutor.ts`）。
- [ ] T049 [P2] 实现删除后的后处理（索引/缓存更新）（`services/circuit-agent/src/services/postDeleteProcessor.ts`）。
- [ ] T050 [P1] 实现删除回滚机制（`specs/005-single-shot-search-summary/migrations/rollback_multi_round.ps1` 与后端回滚 API 支持）。
- [ ] T051 [P1] 在文档中明确量化值（context_scale、timeout、budget、rollback window），并将其写入 `specs/005-single-shot-search-summary/spec.md` 与 `plan.md`（任务输出：`specs/005-single-shot-search-summary/quantified_thresholds.md`）。
- [ ] T052 [P1] 完成 `data-model.md` 的 Citation 与 AnnotatedMessage 字段定义（见下文 data-model 草案），并将定义移入 `specs/005-single-shot-search-summary/data-model.md`。
- [ ] T053 [P1] 完成并校验迁移脚本（T005/T006）与数据模型的一致性，执行一次本地回放验证（输出：`specs/005-single-shot-search-summary/migrations/validation_report.md`）。

## 依赖关系（按用户故事级别）

- US1（后端实现） → 在进行 US2（前端展示）与 US3（引擎策略）集成测试前必须完成
- US3（引擎选择）可独立实现，但对 engine=auto 场景的完整验收需要在 US1 可用时合入
- US4（重试/健壮性）可以并行实现，但最终需集成进 orchestrator

## 并行执行示例

- 前端 UI 任务（T017–T019）可以与后端模型与存储任务（T010–T016）并行开发
- 模式迁移脚本（T005–T006）可以与存储适配器（T008）并行实现

## 实施策略（MVP 优先）

- MVP 范围：优先交付 US1 的最小实现（单次请求 → 解析引用 → 保存 AnnotatedMessage 与 Citation），公开 `/api/v1/search-summary`（优先完成 T010–T015，尤其 T013）

- 递增交付：在完成 MVP 后交付前端展示（US2），再交付引擎策略（US3）与鲁棒性（US4），最后删除旧多轮代码并更新文档

## 任务统计（供实施者补充验证）

- 任务总数（含新增）：37
- 各用户故事任务数：US1=8, US2=5, US3=3, US4=4, Setup/Foundational/Final=17
- 并行执行机会：前端/后端并行、迁移/存储并行、模型/服务分工并行
- MVP 建议：US1（T010–T015）
- 格式校验：本文件中所有任务均遵循 `- [ ] T### [P?] [US?] 描述 (file path)` 格式


