# Implementation Plan: Review Flow Cleanup and Pipeline Assurance

**Branch**: `001-review-flow-cleanup` | **Date**: 2025-10-21 | **Spec**: `/specs/001-review-flow-cleanup/spec.md`
**Input**: Feature specification from `/specs/001-review-flow-cleanup/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

本计划清理与收敛“电路图评审（主副模型架构）”端到端流程：在接收图片/PDF与文本后，基于历史判定初始/修订轮并加载对应 system prompt；当 `enableSearch=true` 时执行识别→检索→逐 URL 摘要→注入合格摘要，保存请求/响应与摘要为 artifacts；输出 OpenAPI 契约与 quickstart 工具化验证步骤，满足宪章门禁的“测试或工具化验证”。

技术路径（Phase 0 研究结论）：后端 Express + TypeScript，前端 Vite + React；以文件系统保存 artifacts 与 sessions，统一根目录由 `STORAGE_ROOT` 控制；上游/检索超时 60–120s；摘要默认 1024 词；单个 artifact 建议 ≤5MB（超出压缩/分片/外链）。

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: Node.js 18 + TypeScript（前后端一致）
**Primary Dependencies**: Express、TypeScript、Vite + React、ESLint/Prettier（TS 严格模式）、OpenRouter 兼容上游
**Storage**: 文件系统（artifacts 与 sessions），统一根由 `STORAGE_ROOT` 控制
**Testing/Verification**: 工具化验证 + artifacts 审计；合同（OpenAPI）优先；本迭代不新增自动化测试
**Target Platform**: 本地 Windows 开发；部署兼容 Linux
**Project Type**: Web 应用（多后端服务 + 前端）
**Performance Goals**: 常规输入端到端 ≤ 2 分钟；提交后 3 秒内出现首条 timeline 事件
**Constraints**: 上游/检索超时 60–120s；artifact 建议 ≤5MB（超出压缩/分片/外链）；敏感信息不入日志/工件
**Scale/Scope**: 单机开发与小规模演示为主

NEEDS CLARIFICATION（已在 `research.md` 解决并定稿）：
- 摘要默认字数限制（定为 1024 词）
- artifact 保留期与清理策略（开发环境手动清理；生产建议 30 天可配置）
- 会话与 artifact 跨服务共享目录策略（统一 `STORAGE_ROOT`）

## Constitution Check

- [x] 代码质量门：Lint/格式化通过；对外接口具备显式类型与边界；异常处理简明。
- [x] 测试/验证门：提供自动化测试或可复现的工具化验证步骤与 artifacts（满足其一即可）。
- [x] UX 一致性门：术语与文档同步；交互与时间线/错误提示一致；双语 README 同步。
- [x] 性能预算门：声明或确认本变更的性能/稳定性预算与降级方案（如需）。

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

### Source Code (actual overview)

```
backend/
├── src/
├── dist/
└── scripts/

services/
├── circuit-agent/
│   ├── src/
│   ├── dist/
│   └── storage/
└── circuit-fine-agent/
    ├── src/
    ├── dist/
    └── storage/

frontend/
├── src/
├── public/
└── dist/
```

**Structure Decision (actual)**: 采用 Web 应用结构（多后端服务 + 前端）。本特性仅产出 `specs/001-review-flow-cleanup/*` 文档与契约，不直接修改源代码。

> Note: Documentation uses POSIX-style relative paths (e.g., `specs/001-review-flow-cleanup/...`) for consistency across platforms. Absolute Windows paths may appear in tasks only as execution hints.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |

