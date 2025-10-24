# Implementation Plan: [FEATURE]

**Branch**: `003-validate-code-against-constitution` | **Date**: 2025-10-23 | **Spec**: `specs/003-validate-code-against-constitution/spec.md`
**Input**: Feature specification from `/specs/003-validate-code-against-constitution/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

本计划旨在验证并确保 `frontend/` 与 `services/circuit-agent/` 符合项目宪法（ReviewAI 宪法）强制项，重点为：

- 提示词完整性与中文化（服务启动时由 `PromptLoader` 校验）
- 启动可控与关键配置校验（`OPENROUTER_BASE`、`STORAGE_ROOT`、`REDIS_URL`）
- 前后端解耦（前端仅通过 `/api/v1/circuit-agent` 公开路由交互）
- README 双语完整性与中文注释覆盖率

Phase0 将聚焦于研究/确认所有 NEEDS CLARIFICATION 并输出 `research.md`；Phase1 将基于研究输出生成 `data-model.md`、API 契约骨架、和 `quickstart.md`。

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: Node.js + TypeScript (frontend: React + TypeScript, backend: Node.js 18+, TypeScript 5.x)
**Primary Dependencies**: `vite`, `react`, `express`, `node-fetch`, `redis` (see `frontend/package.json` & `services/circuit-agent/package.json`)
**Storage**: 本地文件系统为 artifacts/sessions（`STORAGE_ROOT` 可配置），可选 Redis 用于进度存储
**Testing**: 前端已计划使用 Playwright 进行 E2E（已集成配置与示例测试，见 `frontend/playwright.config.ts`）；后端测试框架选型为 `vitest`（计划在 `services/circuit-agent/tests/` 中添加基础用例）。
**Target Platform**: Linux/Windows 开发与 Docker 部署环境（Node.js 18+）
**Project Type**: Web application (frontend + multiple backend microservices)
**Performance Goals**: N/A
**Constraints**: 启动需校验关键环境变量与提示词文件完整性（宪法要求）
**Scale/Scope**: 开源单体仓库，包含多个后端服务与前端

Notes / Unknowns:
- **前端 E2E 测试**: 需要确认是否存在 CI 配置或测试框架（如 Playwright / Cypress）并输出 `frontend/test-reports/`（当前未发现）。标记为 NEEDS CLARIFICATION。
- **后端测试覆盖**: 是否已有单元/集成测试需要确认（NEEDS CLARIFICATION）。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Gates (must pass before Phase 0 research):

- Gate 1 — 提示词完整性: `ReviewAIPrompt/circuit-agent/` 必需中文提示词文件存在且非空；如果加载机制未在服务启动强制校验，则视为违规。 (evidence: `services/circuit-agent/src/infra/prompts/PromptLoader.ts` referenced in repo；`CURSOR.md` 与 README 描述存在)，当前状态: PASSED for presence of loader; NEEDS VERIFICATION for runtime enforcement in current build.
- Gate 2 — 启动可控: `services/circuit-agent` 应校验 `OPENROUTER_BASE`、`STORAGE_ROOT`、`REDIS_URL` 等关键配置并 fail-fast。 (evidence: config references and README entries present); current status: PARTIALLY MET — config reads with defaults exist (openRouterBase has default), need to decide whether defaulting is acceptable or must require explicit env (NEEDS CLARIFICATION).
- Gate 3 — 前后端解耦: 前端不得直接 import 后端源码；静态 scan 未发现跨目录 imports in `frontend/src` referencing `services/` (quick grep returned no matches). current status: PASSED (no cross-imports found).
- Gate 4 — README 双语: `services/circuit-agent` 包含 `README.md` 与 `README.zh.md` — current status: PASSED (both files present).
- Gate 5 — 前端 E2E 报告输出: `frontend/test-reports/` 目录存在且能生成报告 — current status: FAIL / NEEDS ACTION (directory absent and no test scripts in `frontend/package.json`).

Resolution policy: Any Gate marked NEEDS CLARIFICATION must be resolved in Phase 0 research. Any Gate marked FAIL must be justified or fixed prior to Phase 1 design.

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |

## Implementation Steps (map to `spec.md` requirements)

These steps implement each Functional Requirement from `specs/003-validate-code-against-constitution/spec.md`.

- FR-001 提示词完整性 — Implement and test
  - Action: 在 `services/circuit-agent/src/bootstrap/server.ts` 与 `frontend` 启动路径调用 `PromptLoader.preloadPrompts()`。若任一必需提示词文件缺失或大小为 0，抛出 `PromptLoadError` 并 process.exit(1)。
  - Files to edit: `services/circuit-agent/src/bootstrap/server.ts`, `frontend/src/main.tsx`（或 `frontend` 启动入口`）
  - Tests: 向 `specs/003-validate-code-against-constitution/tasks.md` 添加自动化验证脚本：运行服务启动命令並断言退出码 != 0 当缺失提示词；记录 artifact 报告至 `specs/003-validate-code-against-constitution/research.md`。
  - Acceptance: 本地与 CI 启动均能在缺失提示词时 fail-fast 并输出缺失文件路径。

- FR-002 启动可控性 — Implement config validation
  - Action: 集中在 `services/circuit-agent/src/config/config.ts` 添加 `validateRuntimeConfig()`，检测 `OPENROUTER_BASE`、`STORAGE_ROOT`（路径是否存在）与 `REDIS_URL`（若期望），并在不满足时打印建议并退出。
  - Files to edit: `services/circuit-agent/src/config/config.ts`, `services/circuit-agent/src/bootstrap/server.ts`
  - Tests: 添加一个启动模拟脚本在缺少环境变量时断言退出并输出建议修复步骤。
  - Acceptance: CI 环境需显式注入 `OPENROUTER_BASE` 或在开发中允许默认但在合规检查中视为失败。

- FR-003 前後端解耦 — Static scan + CI gate
  - Action: 新增静态扫描脚本 `scripts/check-frontend-no-backend-imports.js`，在 CI（或本地）运行以 grep/AST 檢測 `frontend/src` 中是否存在 `import`/`require` 指向 `../services/` 或 `services/`。
  - Files to add: `scripts/check-frontend-no-backend-imports.js`, add CI job entry (placeholder in `specs/`)
  - Acceptance: 扫描通过（无跨目录导入）或列出违规文件与修复建议。

- FR-004 README 双语完整性 — Sync checklist
  - Action: 在 `specs/003-validate-code-against-constitution/tasks.md` 添加 `README sync check` 步骤，手动或脚本校验 `services/circuit-agent/README.md` 与 `README.zh.md` 的关键段落（API、启动、依赖）。
  - Acceptance: 两份 README 存在且关键段落可比对通过。

- FR-005 中文注释覆盖 — Sampling check
  - Action: 编写脚本 `scripts/sample-chinese-docs.js` 对 `services/circuit-agent/src` 的关键文件抽样统计注释覆盖（检测 JSDoc/TSdoc 中中文字符），并生成报告到 `specs/003-validate-code-against-constitution/`。
  - Acceptance: 报告显示关键模块注释覆盖率 ≥ 90% 或列出改进清单。

- FR-006 前端自动化测试 — Playwright integration (用户已確認)
  - Action: 在 `frontend/package.json` 添加脚本 `test:e2e` 使用 Playwright，并在仓库中加入建议的 `playwright.config.ts`（输出 `frontend/test-reports/` 的 HTML 与 JSON 报告）。
  - Files to add: `frontend/tests/e2e/` sample test, `frontend/playwright.config.ts`, update `frontend/package.json` scripts (placeholders added to `specs/quickstart.md`).
  - Acceptance: `npm --prefix frontend run test:e2e` 在本地可生成 `frontend/test-reports/`（HTML+JSON）。

- FR-007 移除未使用代码 — Audit & recommend
  - Action: 在 `specs/003-validate-code-against-constitution/tasks.md` 添加 `audit-dist-artifacts` 任务：列出 `frontend/dist/`、`services/*/dist/` 中长期存在的产物，建议在 `.gitignore` 或清理脚本中处理并记录在 `CURSOR.md`。
  - Acceptance: 生成清单並給出处理建议（不直接操作 Git）。

- FR-008 配置與文档同步 — CURSOR.md & README
  - Action: 在完成上述改动后，更新 `CURSOR.md` 的变更记录节並在 `services/circuit-agent/README.zh.md` 中注記校验步骤。
  - Acceptance: `CURSOR.md` 中追加变更记录並與 README 说明一致。

## Phase 0 → Phase 1 mapping (deliverables)

- Deliverable: `specs/003-validate-code-against-constitution/research.md` (done)
- Deliverable: `specs/003-validate-code-against-constitution/data-model.md` (done)
- Deliverable: `specs/003-validate-code-against-constitution/contracts/openapi.yaml` (done)
- Deliverable: `specs/003-validate-code-against-constitution/quickstart.md` (done)
- Implementation tasks (to be executed): see Implementation Steps above; each should be broken into tasks in `specs/003-validate-code-against-constitution/tasks.md` for Phase 2 work.

## Gates Re-evaluation

- Gate 1 (Prompts): will be enforced by code edits in `services/circuit-agent` (task assigned).
- Gate 2 (Runtime config): will be enforced by `validateRuntimeConfig()` and CI checks.
- Gate 5 (Front E2E reports): will be closed once Playwright scripts and sample tests generate `frontend/test-reports/` in CI/local runs.

