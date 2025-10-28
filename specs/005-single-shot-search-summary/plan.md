# Implementation Plan: 单次交互的搜索轮与摘要轮

**Branch**: `005-single-shot-search-summary` | **Date**: 2025-10-26 | **Spec**: `spec.md`
**Input**: Feature specification from `/specs/005-single-shot-search-summary/spec.md`

## Summary

将当前多轮“搜索轮 + 摘要轮”合并为**单次模型交互（含 Web 搜索能力）**并输出标准化引用（Citation）。此计划包含技术背景、合规门控（宪法检查）、Phase 0 的研究结论，以及 Phase 1 的数据模型与契约草案指向。

## Technical Context

**Language/Version**: Node.js >= 18
**Primary Dependencies**: OpenRouter client (在线搜索/vision 能力)、Express / Node 后端、Vite + React 前端
**Storage**: 文件系统为主的 artifact 存储（ArtifactStoreFs）；引用实体将保存在后端 DB（或 JSON 存储）中以支持审计
**Testing**: Vitest（单元/集成），Playwright（端到端）
**Target Platform**: Linux/Windows 开发与容器化部署
**Project Type**: Web 服务（前端 + 后端 微服务）
**Performance Goals**: P95 端到端时延相比旧多轮实现降低 ≥30%（见 Spec 的 SC-002）
**Constraints**: 单次请求（请求计数=1）；最大搜索结果 ≤ 10；默认 max_results=5；默认上下文规模=high
**Scale/Scope**: 以现有服务（circuit-agent）为载体，实现单次搜索+摘要能力并保持向后兼容前端展示

## Constitution Check

*GATE: 以下项须在 Phase 0 前确认并在 Phase 1 设计实现。*

- 提示词完整性（ReviewAIPrompt/*）: 已核验（见 `services/*/src/infra/prompts/PromptLoader.ts` 以及 `.specify/memory/constitution.md` 要求）
- 启动可控与快速失败: 计划遵守（启用严格预热，缺失即失败）
- 前后端契约化：所有对外接口将以 OpenAPI/JSON schema 明确声明（见 contracts/）
- 中文注释与 README 双语: 需求纳入任务（见 tasks.md）

结论：无阻塞性宪法违例，继续进入 Phase 0

## Constitution Re-evaluation (post-design)

审查点：已生成的 `data-model.md`、`contracts/openapi.yaml`、`research.md` 与 `quickstart.md` 是否满足宪法要求（提示词完整性、快速失败、中文注释/README、契约化）。

检查结果：

- 提示词完整性：未修改提示词，符合要求（需在合并/部署前在 CI 中运行 `PromptLoader` 的预热检查以验证）。
- 启动可控与快速失败：本计划建议使用现有 `PROMPT_PRELOAD_STRICT` 启用严格预热，未引入绕过机制，合规。
- 前后端契约化：已生成 OpenAPI 草案 `contracts/openapi.yaml`，符合契约化要求；在实现时需保持版本化策略以兼容前端。
- 中文注释与 README：Data model 与 research 文档已经使用中文说明；需要将变更同步到服务级 README（任务）。

结论：设计产物满足宪法要求；需要在 PR/CI 中加入以下可验证步骤：

1. `PromptLoader` 预热校验（非空与路径存在）
2. OpenAPI 与实现的一致性校验（`scripts/check-contract-implementation.js`）
3. 注释覆盖与 README 同步检查（`scripts/check-head-comments.sh`、`scripts/check-readme-sections.ps1`）

CI 门控矩阵（建议）:
- pre-merge: 静态检查（OpenAPI lint、`npm run check:prompts`）、单元测试快速套件
- merge: 完整单元测试、契约一致性校验（`scripts/check-contract-implementation.js`）
- post-merge: 集成/端到端回归（Playwright/集成套件），并验证 `specs/005-single-shot-search-summary/quantified_thresholds.md` 中定义的量化阈值（例如单轮请求计数、P95 时延目标）

合规等级：可进入 Phase 1（实现）—— 无阻塞性违例，但需在合并前通过上述 CI 校验。

## Project Structure

```
specs/005-single-shot-search-summary/
├── spec.md
├── plan.md          # 本文件（/speckit.plan 输出）
├── research.md      # Phase 0 输出
├── data-model.md    # Phase 1 输出
├── quickstart.md    # Phase 1 输出
├── contracts/       # Phase 1 输出（OpenAPI）
└── tasks.md         # /speckit.tasks 输出（非本命令创建）
```

## 分阶段移除计划

在新功能稳定运行 30 天后，计划移除旧功能。移除前需通知相关维护人员，并提供迁移指南与回滚演练记录。


