# Feature Specification: 校验前端与 circuit-agent 对照 ReviewAI 宪法

**Feature Branch**: `003-validate-code-against-constitution`
**Created**: 2025-10-23
**Status**: Draft
**Input**: 用户描述: "检查前端代码以及circuit-agent这个后端代码是否满足speckit的constitution要求，如果不满足就需要修改。其他后端代码暂时不做要求。@constitution.md"

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - 校验提示词与启动可控性 (Priority: P1)

作为维护者，我需要验证 `frontend` 与 `services/circuit-agent` 在启动时能够按照宪法要求加载并校验 `ReviewAIPrompt` 中的中文提示词，保证服务在缺失或为空时以可操作错误退出。这样可以避免运行时行为不确定并确保提示词完整性。

**Why this priority**: 提示词完整性为宪法首要强制项，直接影响模型行为和安全性。

**Independent Test**: 在缺失或空内容的提示词文件情况下启动服务，观察服务是否 fail-fast 并记录明确错误；在完整提示词存在时服务成功启动。

**Acceptance Scenarios**:

1. **Given** 仓库中 `ReviewAIPrompt/circuit-agent/` 包含完整中文提示词，**When** 启动 `circuit-agent`，**Then** 服务启动成功且 `PromptLoader.preloadPrompts()` 返回已加载文件列表。
2. **Given** 任一必需提示词文件缺失或为空，**When** 启动 `circuit-agent`，**Then** 启动过程以明确的错误码/日志退出，指出缺失文件路径。

---

### User Story 2 - 前后端契约与解耦性校验 (Priority: P2)

作为架构审计员，我需要确认前端仅依赖 `services/circuit-agent` 暴露的 HTTP/REST 接口（如 `/api/v1/circuit-agent/*`），且不依赖后端内部实现细节或共享文件/数据库。这样可以保证前后端解耦并便于替换后端实现。

**Why this priority**: 前后端解耦为宪法强制项，影响部署独立性与维护成本。

**Independent Test**: 在前端构建/运行时审查 API 调用点（`frontend/src` 中对后端的 fetch/axios 调用），验证调用的 URL 与后端公开路由一致；确保前端没有 import 后端代码或直接读取后端文件路径。

**Acceptance Scenarios**:

1. **Given** 前端代码在 `frontend/src` 中，**When** 运行静态代码分析（grep 查找 `services/` 等跨目录 import），**Then** 不应发现对后端源代码的直接导入或文件系统依赖。
2. **Given** 前端请求后端 API 的代码，**When** 对照 `services/circuit-agent/src/interface/http` 的路由定义，**Then** 请求路径应均映射到公开路由且包含版本前缀 `/api/v1/circuit-agent`。

---

### User Story 3 - 文档与 README 双语完整性校验 (Priority: P3)

作为维护者，我需要确认 `services/circuit-agent/` 包含等效的中文与英文 README（`README.zh.md` 与 `README.md`），并且文件中包含 API 列表、启动步骤与依赖说明，以满足宪法第8条要求。

**Why this priority**: 文档是合规与交付质量的重要保障，但不直接影响运行时安全，因此列为 P3。

**Independent Test**: 检查 `services/circuit-agent/` 目录是否包含 `README.md` 与 `README.zh.md`，并抽查文档包含必要段落（API、启动步骤、依赖）。

**Acceptance Scenarios**:

1. **Given** `services/circuit-agent` 目录，**When** 读取 README 文件，**Then** 两个 README 文件存在且章节大致等效（语言差异允许）。

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

- 当提示词文件存在但格式错误（非 UTF-8 或包含不可见控制字符）时，系统如何处理；预期：校验报错并提示文件编码/格式问题。
- 当前端在开发模式下代理配置与生产接口路径不一致时，应确认前端构建或代理未硬编码生产路径；预期：使用环境变量或 runtime 配置。
- 当 `enableSearch=true` 且上游检索服务不可用时，编排路由应记录错误并允许可配置的回退（例如不注入检索摘要），但须记录为可观测错误并纳入审计。

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001 提示词完整性**: `frontend` 与 `services/circuit-agent` 启动时必须由现有 `PromptLoader`（或等效校验函数）校验 `ReviewAIPrompt/circuit-agent/` 中所有必需中文提示词文件存在且非空；若缺失或为空，服务应以明确错误退出（fail-fast），并在日志中记录缺失文件路径与建议修复步骤。
- **FR-002 启动可控性**: `services/circuit-agent` 在引导阶段必须校验关键运行时配置（`OPENROUTER_BASE`、`STORAGE_ROOT`、`STORAGE_ROOT` 指定的路径是否存在等），在任一关键依赖不满足时应退出并记录原因。
- **FR-003 前后端解耦**: 前端代码不得直接导入后端源代码或依赖后端运行时文件系统结构，所有交互必须通过公开 HTTP/REST 接口（以 `/api/v1/circuit-agent` 为基路径）。
- **FR-004 README 完整性**: `services/circuit-agent` 必须包含 `README.md` 与 `README.zh.md` 两份等效文档，至少包含 API 列表、启动流程、依赖说明与调试步骤。
- **FR-005 中文注释覆盖**: `services/circuit-agent` 的 TypeScript/JavaScript 源代码关键模块（路由、usecase、infra、prompts、storage）应包含中文注释，覆盖模块说明、对外接口说明、参数与错误语义等。
- **FR-006 前端自动化测试基础**: 前端项目应包含可运行的端到端测试脚本或占位测试（如 `frontend/test-reports/` 输出路径），并能通过 chrome-devtools MCP 或等效方式运行；若无自动化脚本，应在规范中列出需要补充的测试条目。
- **FR-007 移除未使用代码**: 仓库中不应包含长期未使用的 dist 产物或冗余代码；发现的遗留 dist artifact（如前端 `dist/` 中的生成产物）应记录并视需要清理。
- **FR-008 配置与文档**: 项目根 `CURSOR.md`、根 README 与 `services/circuit-agent/README.zh.md` 必须同步反映本文档与实现之间的差异与修复步骤。

### Key Entities

- **PromptFile**: 表示单个提示词文件，属性：`agent`、`language`、`variant`、`path`、`sizeBytes`、`sha256`（用于完整性校验）。
- **ServiceConfig**: 表示服务运行时关键配置，属性：`OPENROUTER_BASE`、`STORAGE_ROOT`、`PORT`、`REDIS_URL`。
- **APIContract**: 表示前端与后端的契约化接口，属性：`path`、`method`、`requestSchemaSummary`、`responseSchemaSummary`、`requiredAuth`

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001 启动提示词校验通过率**: 在本地开发与 CI 环境中，`circuit-agent` 启动时 100% 加载到必需提示词文件（无缺失）。

- **SC-002 前后端契约一致性**: 抽样 95% 的前端 API 调用均能直接映射到 `services/circuit-agent` 的公开路由（路径与方法匹配）。

- **SC-003 README 覆盖度**: `services/circuit-agent` 的中英 README 至少覆盖 API 列表、启动步骤与依赖说明，核查通过率 100%。

- **SC-004 中文注释覆盖率（目标）**: 对关键模块进行抽样检查，目标覆盖率 ≥ 90%（注释包含模块说明与公有函数签名）。

- **SC-005 测试输出可观测性**: 若已实现前端自动化测试，测试报告应输出到 `frontend/test-reports/` 并包含 JSON/HTML 报告，CI 可访问。

## 补充功能需求

- **FR-009 前端 E2E 测试输出**: 前端必须提供端到端（E2E）测试并将测试报告输出到 `frontend/test-reports/`，报告应同时包含机器可读（JSON）与人可读（HTML）格式，便于 CI 与人工审查。
- **FR-010 启动配置校验**: `services/circuit-agent` 在启动过程中必须集中校验关键环境变量（`OPENROUTER_BASE`、`STORAGE_ROOT`、`REDIS_URL`），并在缺失或不合法时以可操作的错误退出（说明缺失项与建议修复方法）。
- **FR-011 注释覆盖度与质量**: 对关键模块（路由、usecases、infra、prompts、storage）进行注释覆盖度抽样检查，目标覆盖率 ≥90%；注释须为中文并使用规范化格式（JSDoc/TSdoc 风格）。

## 补充成功标准

- **SC-006 前端测试覆盖率目标（建议）**: 前端 E2E 覆盖率建议目标 ≥90%（可作为长期目标）；若无法立刻达到，需在规范中列出提升计划与里程碑。
- **SC-007 启动校验可观测性**: 当关键环境变量缺失或无效时，`circuit-agent` 应在启动日志中输出明确且可供运维/开发定位的错误信息（包含变量名与建议修复步骤）。

## 补充假设

- E2E 覆盖率目标可根据团队能力逐步达成，初始阶段允许以占位测试与 CI 报告为过渡方案。
- 本次变更仅涉及文档更新，不会修改代码或运行时行为。

## Assumptions

- 默认检查范围仅限 `frontend/` 与 `services/circuit-agent/`，其他后端服务暂不纳入本次校验。
- 使用现有 `PromptLoader` 的加载约定作为提示词完整性校验实现依据。
- 若存在歧义，则按宪法中优先级（提示词完整性、启动可控、前后端解耦）进行优先级排序和处理。

