---
description: Tasks for feature 003-validate-code-against-constitution
---

# Tasks: 校验前端与 circuit-agent 对照 ReviewAI 宪法

**Input**: `specs/003-validate-code-against-constitution/plan.md`, `specs/003-validate-code-against-constitution/spec.md`, `research.md`, `data-model.md`, `contracts/openapi.yaml`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 项目初始化与共享脚手架

- [ ] T001 [P] 在 `services/circuit-agent/src/bootstrap/server.ts` 中添加对 `PromptLoader.preloadPrompts()` 的调用，确保启动时预加载提示词并返回加载清单
- [ ] T002 [P] 在 `frontend/src/main.tsx` 中添加对 `frontend/src/utils/promptCheck.ts` 的启动调用（使开发/热重载时触发提示词健康检查）
- [ ] T002a [P] 在 `frontend/src/utils/promptCheck.ts` 中实现调用后端提示词健康接口 `/api/v1/circuit-agent/system-prompt?lang=zh`，并将结果暴露为 Promise 接口（文件：`frontend/src/utils/promptCheck.ts`）
- [ ] T003 [P] 在仓库根确认或补充脚本 `scripts/check-frontend-no-backend-imports.js`（如缺失，创建该脚本），并在 `scripts/` 中添加使用说明
- [ ] T004 在 `specs/003-validate-code-against-constitution/` 下创建 `contracts/api-mapping.md`，初始化前端请求到后端公开路由的映射表（基于 `contracts/openapi.yaml`）

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 阻塞所有用户故事的基线功能，必须先完成

- [ ] T005 在 `services/circuit-agent/src/config/config.ts` 中添加 `validateRuntimeConfig()` 并导出，检测 `OPENROUTER_BASE`（在 CI/生产环境需为显式配置）、`STORAGE_ROOT`（路径存在性）与 `REDIS_URL`（可选但若配置需校验格式）
- [ ] T006 在 `services/circuit-agent/src/bootstrap/server.ts` 中调用 `validateRuntimeConfig()` 并在校验失败时打印可操作建议后 `process.exit(1)`
- [ ] T007 在 `frontend/package.json` 中添加 `test:e2e` 脚本：`npx playwright test --reporter=list,html --output=./test-reports`（若 `playwright.config.ts` 已存在则仅添加脚本）
- [ ] T008 在 `services/circuit-agent/package.json` 中添加 `test:unit` 脚本（例如：`vitest` 占位），并在仓库路径 `services/circuit-agent/tests/` 中创建占位配置文件 `services/circuit-agent/vitest.config.ts`（或 `services/circuit-agent/tests/vitest.config.ts`）以便后续补充测试用例
- [ ] T009 在 `specs/003-validate-code-against-constitution/` 下添加 `audit-dist-artifacts.md`，列出长期存在的 `frontend/dist/` 与 `services/*/dist/` 中建议清理的产物清单
- [ ] T025 [P] 在 `frontend/playwright.config.ts` 与 `frontend/tests/e2e/sample.spec.ts` 中添加 Playwright 配置与示例测试，确保与 `frontend/package.json` 的 `test:e2e` 脚本协同工作（见 T007）
- [ ] T027 [P] 在 `scripts/sample-chinese-docs.js` 中实现注释抽样脚本，输出 `specs/003-validate-code-against-constitution/chinese-docs-report.json`（用于 T022 的注释覆盖率评估）

---

## Phase 3: User Story 1 - 校验提示词与启动可控性 (Priority: P1) 🎯 MVP

**Goal**: 启动时强制校验 `ReviewAIPrompt/circuit-agent/` 中必需的中文提示词文件存在且非空；在缺失/为空时 fail-fast

**Independent Test**: 在缺失或空提示词文件情况下启动服务并断言退出码 != 0；在完整提示词存在时服务能成功启动并打印已加载列表

### Implementation (按需并行)

- [ ] T010 [US1] 在 `services/circuit-agent/src/infra/prompts/` 添加 `PromptValidator.ts`，实现基于 `data-model` 的 `PromptFile` 校验（检查 `path` 存在与 `sizeBytes > 0`，并计算 `sha256`）
- [ ] T011 [US1] 在 `services/circuit-agent/src/bootstrap/server.ts` 中集成 `PromptValidator`，在 `preloadPrompts()` 抛出异常时记录缺失文件路径并 `process.exit(1)`（实现 FR-001）
- [ ] T012 [US1] 在 `frontend/src` 添加一条启动自检任务（`frontend/src/utils/promptCheck.ts`），用于在开发模式下请求后端提示词健康接口或根据 quickstart 提供的 `node services/... --check-prompts` 方式校验
- [ ] T013 [US1] 在 `specs/003-validate-code-against-constitution/quickstart.md` 中加入“提示词缺失故障排查”步骤与示例命令（已存在 quickstart，需补充示例）
- [ ] T014 [US1] [P] 编写一个轻量化脚本 `specs/003-validate-code-against-constitution/check-missing-prompts.ps1` 用于 CI/本地快速模拟缺失文件场景并断言退出码

---

## Phase 4: User Story 2 - 前后端契约与解耦性校验 (Priority: P2)

**Goal**: 确保前端仅通过公开 HTTP 接口与 `services/circuit-agent` 交互，且无跨目录导入后端源码

**Independent Test**: 运行静态扫描脚本并验证结果；抽样前端 fetch/axios 呼叫能映射到 `contracts/openapi.yaml` 中的路径

### Implementation

- [ ] T015 [US2] 运行并修正 `scripts/check-frontend-no-backend-imports.js` 结果：在 `frontend/src` 中消除任何指向 `../services/` 或 `services/` 的 import（若存在）
- [ ] T016 [US2] 在 `specs/003-validate-code-against-constitution/contracts/api-mapping.md` 中填充前端 API 调用到 `contracts/openapi.yaml` 的映射条目（逐条对照）
- [ ] T017 [US2] 在 `frontend/src` 中替换任何硬编码后端基路径为运行时配置（示例 `src/config/apiBase.ts` 或使用 `import.meta.env.VITE_API_BASE`），并在 `frontend/.env.example` 中给出示例

---

## Phase 5: User Story 3 - 文档与 README 双语完整性校验 (Priority: P3)

**Goal**: `services/circuit-agent` 保持中英 README 等效并包含 API 列表、启动与依赖说明

**Independent Test**: 检查两份 README 是否存在并包含关键段落

### Implementation

- [ ] T018 [US3] 在 `specs/003-validate-code-against-constitution/` 添加 `readme-sync-check.md`，列出需比对的关键段落（API、启动、依赖）并记录当前差异
- [ ] T019 [US3] 如果发现差异，在 `services/circuit-agent/README.md` 与 `services/circuit-agent/README.zh.md` 中同步必要的段落（明确文件路径：`services/circuit-agent/README.md`、`services/circuit-agent/README.zh.md`）
- [ ] T020 [US3] 在 `CURSOR.md` 末尾追加一条变更记录，说明已生成 `specs/003-validate-code-against-constitution/tasks.md` 并列出主要修改点（该任务在本次变更中由 AI 助手执行）

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T021 [P] 代码清理：在 `frontend/dist/` 与 `services/*/dist/` 中生成 `audit-dist-artifacts.md` 报告（见 T009）
- [ ] T022 [P] 编写并提交 `specs/003-validate-code-against-constitution/validation-checklist.md`，包含所有 Acceptance Scenarios 的逐项核验步骤
- [ ] T023 [P] 在 `specs/003-validate-code-against-constitution/` 中补充 `implementation-notes.md`，记录实现要点与回滚/兼容策略
- [ ] T024 在完成上述后，执行 `frontend` 与 `services/circuit-agent` 的一次 end-to-end 验证（手动或 CI），并在 `specs/003-validate-code-against-constitution/` 记录结果
- [ ] T026 [P] 在 `specs/003-validate-code-against-constitution/e2e-coverage-plan.md` 中创建 E2E 覆盖率提升计划，包含分阶段目标与测量方法（用于 T007 的长期目标）
- [ ] T028 在 `specs/003-validate-code-against-constitution/ci-e2e-example.md` 或 `.github/workflows/e2e-example.yml` 中添加 CI 示例，展示如何在 CI 中运行 Playwright 并保存 `frontend/test-reports/`

---

## Phase N: Requirements → Tasks 映射（自动化与验证脚本）

**Purpose**: 将 `checklists/requirements.md` 中的每条检查项映射为可执行任务与自动化验证产物，便于 CI/人工逐项验证。

- [ ] T029 [P] 在仓库根添加脚本 `scripts/check-spec-no-implementation-details.js`，扫描 `specs/003-validate-code-against-constitution/spec.md` 中的实现细节关键词（例如：`Node` `React` `Vite` `Express` `API`）并生成报告 `specs/003-validate-code-against-constitution/implementation-details-report.json`
- [ ] T030 在 `specs/003-validate-code-against-constitution/validation-checklist.md` 中新增条目：要求产品负责人签署“业务价值”审阅并记录审阅者与时间（文件：`specs/003-validate-code-against-constitution/validation-checklist.md`）
- [ ] T031 在 `specs/003-validate-code-against-constitution/validation-checklist.md` 中新增条目：安排并记录一次非技术人员可读性审阅，输出审阅结论文件 `specs/003-validate-code-against-constitution/nontechnical-review.md`
- [ ] T032 [P] 添加脚本 `scripts/check-spec-sections.js`，验证 `specs/003-validate-code-against-constitution/spec.md` 含有必填章节（目的/范围/验收标准/依赖/风险/里程碑），并输出 `specs/003-validate-code-against-constitution/sections-report.json`
- [ ] T033 [P] 添加脚本 `scripts/check-gwt.js`，确认每项需求包含至少一条 Given/When/Then，输出 `specs/003-validate-code-against-constitution/gwt-report.json`
- [ ] T034 在仓库根 `.gitignore` 中确保包含 `frontend/dist/` 与 `services/*/dist/`（若缺失则补充），并将候选清单保存至 `specs/003-validate-code-against-constitution/audit-dist-artifacts.md`
- [ ] T035 [P] 生成映射文档 `specs/003-validate-code-against-constitution/requirements-to-tasks-mapping.md`，逐条列出 `checklists/requirements.md` 中每项与 `tasks.md` 的对应关系（文件路径：`specs/003-validate-code-against-constitution/requirements-to-tasks-mapping.md`）
- [ ] T036 在 `CURSOR.md` 中追加变更记录，说明已将 `requirements.md` 的每条检查项映射为任务并生成 `requirements-to-tasks-mapping.md`（文件：`CURSOR.md`）

---

## Dependencies & Execution Order

- Foundational (T005-T009) 必须在任何用户故事之前完成
- User Story 1 (T010-T014) 为 MVP，建议优先完成
- User Story 2 (T015-T017) 与 User Story 3 (T018-T020) 在 Foundation 完成后可并行执行

## Parallel execution examples

1. 并行运行 Setup 中的 `T001`、`T002`、`T003`、`T004`（均标为 [P]）
2. Foundation 完成后：开发者 A 做 T010-T014（US1），开发者 B 做 T015-T017（US2），开发者 C 做 T018-T020（US3）

## Implementation strategy

- MVP: 仅完成 Foundational 与 User Story 1（即到 T014），然后停止并验证（见 template MVP First）
- 增量交付：在验证 US1 后并行推进 US2 与 US3

---

## Validation

- 本文件中的每项任务均遵循严格的清单格式 `- [ ] T### [P?] [US?] Description with file path`

Generated-by: GPT-5 Mini

## 任务最终输出与验收准则（逐项）

- **T001 输出**: 修改 `services/circuit-agent/src/bootstrap/server.ts`，新增 `PromptLoader.preloadPrompts()` 调用。验收：启动 `circuit-agent` 能在日志中打印已加载提示词清单（文件路径与字节数），并在缺失时抛出明确错误。
- **T002 输出**: 修改 `frontend/src/main.tsx`（或入口文件），新增提示词自检调用或从后端获取提示词健康信息的逻辑。验收：开发启动时能调用后端提示词健康接口并在控制台/UI 中显示状态。
- **T003 输出**: 在 `scripts/check-frontend-no-backend-imports.js` 中提供可运行脚本并在 README 中写明用法。验收：运行脚本返回违规文件列表或通过结果（退出码 0）；CI 可直接复用。
- **T004 输出**: 新增 `specs/003-validate-code-against-constitution/contracts/api-mapping.md` 文件，包含前端主要调用与后端公开路由的逐条映射（至少覆盖 `/api/v1/circuit-agent/orchestrate/review`）。验收：文件存在且条目可追溯至 `contracts/openapi.yaml`。
- **T005 输出**: 在 `services/circuit-agent/src/config/config.ts` 中新增 `validateRuntimeConfig()` 并导出。验收：在不同环境变量组合下调用返回问题列表或通过（便于测试脚本断言）。
- **T006 输出**: 在 `services/circuit-agent/src/bootstrap/server.ts` 中调用 `validateRuntimeConfig()` 并在失败时 `process.exit(1)`。验收：在缺失或不合法配置时进程以非 0 退出并在日志中输出建议修复步骤。
- **T007 输出**: 在 `frontend/package.json` 增加 `test:e2e` 脚本。验收：运行 `npm --prefix frontend run test:e2e`（在已安装 Playwright 的环境）能生成 `frontend/test-reports/`（HTML/JSON）。
- **T008 输出**: 在 `services/circuit-agent/` 下创建 `tests/` 目录并在 `package.json` 增加 `test:unit` 脚本（vitest 占位）。验收：运行 `npm --prefix services/circuit-agent run test:unit` 可执行并返回退出码（即使无具体测试亦应可运行）。
- **T009 输出**: 新增 `specs/003-validate-code-against-constitution/audit-dist-artifacts.md` 报告，列出候选清理文件与建议。验收：文件包含 `frontend/dist/` 与 `services/*/dist/` 的候选路径与建议动作。
- **T010 输出**: 新增 `services/circuit-agent/src/infra/prompts/PromptValidator.ts`，实现 PromptFile 校验并能计算 sha256。验收：提供导出函数 `validatePromptFiles()`，返回验证结果数组并写入可供测试读取的 JSON 文件（例如 `specs/.../prompt-validation.json`）。
- **T011 输出**: 在 `services/circuit-agent/src/bootstrap/server.ts` 集成 `PromptValidator`，在失败时打印缺失文件并退出。验收：当提示词缺失时，启动进程以非 0 退出并在日志中包含缺失路径；当完整时写入 `prompt-validation.json` 并正常启动。
- **T012 输出**: 新增 `frontend/src/utils/promptCheck.ts`（或等价位置），实现对后端提示词健康接口的调用与本地验证逻辑。验收：在开发模式运行时，能调用并展示后端返回的提示词状态。
- **T013 输出**: 更新 `specs/.../quickstart.md`，增加提示词缺失故障排查示例命令与输出示例。验收：文档中包含可复制的故障排查命令与预期输出示例。
- **T014 输出**: 新增脚本 `specs/003-validate-code-against-constitution/check-missing-prompts.ps1`，可在 CI 中模拟缺失提示词场景并断言退出码。验收：脚本执行后在缺失场景返回非 0，且在完整场景返回 0。
- **T015 输出**: 运行并修正 `scripts/check-frontend-no-backend-imports.js` 的结果；若需要，修复前端代码中的非法 import（或在文档中记录修复点）。验收：脚本在 `frontend/src` 无违法 import 时返回通过结果；若之前有违规，报告列出并记录修复文件路径。
- **T016 输出**: 完成 `specs/.../contracts/api-mapping.md` 的填充（见 T004），并增加映射验证表格。验收：映射条目能够追溯到 `contracts/openapi.yaml` 中对应路径与方法。
- **T017 输出**: 在 `frontend/src` 中替换硬编码后端基路径为运行时配置并新增示例 `.env.example`。验收：前端在不同 `VITE_API_BASE` 配置下能正确请求对应后端（可手动或脚本验证）。
- **T018 输出**: 新增 `specs/.../readme-sync-check.md`，列出比对项与当前差异。验收：文件包含关键段落比对矩阵并标注差异行号。
- **T019 输出**: 若发现差异，更新 `services/circuit-agent/README.md` 与 `services/circuit-agent/README.zh.md` 使关键段落保持等效（记录修改文件与摘要）。验收：比对矩阵显示关键段落一致或已标注接受的差异。
- **T020 输出**: 在 `CURSOR.md` 追加变更记录项，记录 tasks.md 的生成与后续更新（此条已完成一次）。验收：`CURSOR.md` 包含对应时间戳与说明文本。
- **T021 输出**: 生成 `specs/.../audit-dist-artifacts.md`（见 T009）并将报告保存至 specs 目录。验收：报告已生成并列出建议操作。
- **T022 输出**: 新增 `specs/.../validation-checklist.md`，包含每个 Acceptance Scenario 的逐项核验步骤（可供 CI/人工复核）。验收：文件覆盖 FR-001..FR-008 的核验步骤并可用于 CI 失败/通过判定。
- **T023 输出**: 新增 `specs/.../implementation-notes.md`，记录实现细节、回滚与兼容策略。验收：文件包含关键实现决策与回滚步骤的明确说明。
- **T024 输出**: 将 end-to-end 验证结果写入 `specs/.../e2e-results.md`（或在 quickstart 下追加），包含环境、执行命令、日志片段与结论。验收：文件存在且能复现验证步骤与结果。

- **T025 输出**: 在 `frontend/` 添加 Playwright 配置与示例测试：`frontend/playwright.config.ts`、`frontend/tests/e2e/sample.spec.ts`，并提供示例报告到 `frontend/test-reports/`。验收：在本地安装 Playwright 后运行 `npm --prefix frontend run test:e2e` 能生成 `frontend/test-reports/`（HTML/JSON）。
- **T026 输出**: 新增 `specs/003-validate-code-against-constitution/e2e-coverage-plan.md`，定义前端 E2E 覆盖率提升里程碑（分阶段目标、测量方法、阈值）。验收：文件存在并包含可量化里程碑（例如 30%→60%→90%）与测量方法说明。
- **T027 输出**: 创建 `scripts/sample-chinese-docs.js`，实现对 `services/circuit-agent/src` 的注释抽样并输出 `specs/.../chinese-docs-report.json`（包含文件列表与注释覆盖百分比）。验收：脚本可运行并生成 JSON 报告，报告能用于决策（哪些文件需补注释）。
- **T028 输出**: 在 `specs/003-validate-code-against-constitution/` 添加 CI 示例 `specs/.../ci-e2e-example.md`，包含在 CI 中运行 Playwright 并保存 `frontend/test-reports/` 的示例步骤（或 `.github/workflows/e2e-example.yml` 占位）。验收：文档包含可复制的 CI 作业示例与说明。

# Phase 2 tasks (to be executed by maintainers / CI)

1. PromptLoader enforcement
   - Run: Start `services/circuit-agent` with missing prompt file and assert process exits with non-zero code.
   - Owner: backend maintainer

2. Runtime config validation
   - Run: Start `services/circuit-agent` with `OPENROUTER_BASE` unset in CI; assert failure or mark as dev-only default.
   - Owner: backend maintainer

3. Frontend E2E (Playwright)
   - Run: `npm --prefix frontend run test:e2e` after starting dev server; output saved to `frontend/test-reports/`.
   - Owner: frontend maintainer

4. Static import scan
   - Run: `node scripts/check-frontend-no-backend-imports.js` and fail CI on violations.
   - Owner: infra

5. README sync check
   - Manual: compare `services/circuit-agent/README.md` and `README.zh.md`; script optional.

6. Dist artifact audit
   - Manual: list candidate files in `frontend/dist/` and `services/*/dist/`; propose `.gitignore` changes.

7. Chinese comments sampling
   - Run: `node scripts/sample-chinese-docs.js` (placeholder) to produce coverage report.


