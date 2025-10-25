# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

本实现计划针对 `specs/004-audit-constitution/spec.md` 中定义的需求：在不影响多 agent 后端的前提下，完善前端与单 agent 后端（`services/circuit-agent`）的提示词完整性校验、前端契约化错误兜底、以及双语 README 同步。计划基于现有实现（`PromptLoader`、`ArtifactStoreFs`、Vite + React 前端）进行增强与文档同步，优先保证启动时提示词的 fail-fast 行为、前端对后端错误的友好提示与导出诊断能力，以及 README 的中英文同步。

## Technical Context

**Language/Version**: Node.js >= 18 (运行时)、TypeScript >= 5.x（源码）；前端基于 Vite + React。
**Primary Dependencies**: `express`（后端 HTTP）、`multer`（multipart）、`node-fetch`/`OpenRouterClient`（上游调用）、`vite`、`react`、`@playwright/test`（端到端测试）、`vitest`（单元测试）。
**Storage**: 开发/默认：文件系统（`ArtifactStoreFs`）；可选 Redis 用于短期进度/状态（`redis` dependency 已存在）。
**Testing**: 单元测试使用 `vitest`，端到端使用 `Playwright`（已在 `frontend/package.json` 中声明），报告产物写入 `frontend/test-reports/`。
**Target Platform**: 生产：Linux 服务器（container/VM）；开发：Windows/macOS（支持 Node.js 18+）。
**Project Type**: Web application（前端 `frontend/` + 后端 `services/circuit-agent/`）。
**Performance Goals**: 启动阶段提示词预加载在 30s 内完成（见 spec SC-001）；用于 UI 的状态/健康端点 p95 < 200ms（非 LLM 调用路径）。
**Constraints**: 限制单请求附件体积（由前端/后端共同限定），启动时若缺失关键配置或提示词需 fail-fast（或按 spec 记录警告，见 Clarifications）。
**Scale/Scope**: 目标为小至中等并发（数百并发用户）；非大规模流量工程。

## Verification scripts and CI gates

为保证实现满足 `spec.md` 中的 Success Criteria 与 FR 条款，计划将在 `specs/004-audit-constitution/` 中提供并引用以下验证脚本（开发者/CI 可直接调用）：

- `scripts/check-prompts.ps1` — 校验 `ReviewAIPrompt/{agent}` 下所有 prompt 文件存在且非空；缺失或语义性空白时返回非零退出码（exit 3）。
- `scripts/check-readme-sections.ps1` — 校验 `services/circuit-agent/README.md` 与 `README.zh.md` 中包含至少 `API 列表`、`示例调用`、`启动/停止`、`依赖说明`、`Mermaid` 等章节；校验失败返回非零退出码（exit 4）。
 - `scripts/check-head-comments.sh` — 抽样或静态检查公共函数是否包含中文头部注释；已实现为 `scripts/check-head-comments.sh`（仓库顶层），返回非零退出码（exit 5）时表示存在缺失的文件。

CI Gate recommendations:

- 在 PR pipeline 的 pre-merge 阶段运行 `check-prompts.ps1` 与 `check-readme-sections.ps1`；任一脚本失败将阻止合并（除非由维护者批准的例外）。
- 在主分支合并后，由 CI 运行 Playwright 验收套件；达到 `frontend/test-reports/` 中的 HTML 报告且关键场景通过率 ≥ 95% 则视为通过。

以上脚本路径与行为已在 `quickstart.md` 与 `research.md` 中引用。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Gates (derived from `.specify/memory/constitution.md`):

- **Prompt completeness**: 所有 `circuit-agent` 相关的 system prompt 文件必须存在且非空；若存在缺失或语义性空白（仅空行）则视为不合格。
- **Readme 同步**: `services/circuit-agent/` 目录须包含 `README.md` 与 `README.zh.md` 并至少含有 API 列表、示例调用、启动步骤与 Mermaid 流程图。
- **中文注释覆盖**: 计划中修改或新增的公共函数/模块必须包含结构化中文头部注释（用途、参数、返回、示例）。

当前草案中未发现无法在后续设计阶段解决的阻塞性门禁，但 Phase 1 需要提供具体的验证脚本或检查清单以示合规。

<!-- 宪法新增要求：头部注释规范（已同步）
  - 要求：每个功能模块（函数/对象/类）在定义处包含结构化头部注释，注释必须包含：用途、输入参数、输出参数、使用方法示例；注释应以简体中文为主并采用面向人类阅读者的风格（清晰、示例驱动、避免冗长）。
  - 检查点示例：代码审计任务应验证文件中是否存在头部注释或由 CI 提供的注释检查脚本通过。 -->

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

