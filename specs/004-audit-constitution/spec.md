# Feature Specification: 完善前端与单 Agent 后端规范

**Feature Branch**: `update-frontend-single-agent`
**Created**: 2025-10-24
**Status**: Draft
**Input**: User description: "我要求按照新梳理的@constitution.md 要求，重新完善前端和单agent后端代码及相关文档，多agent后端暂时不处理。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 启动检查与提示词完整性验证 (Priority: P1)

普通开发者或运维在本地启动单个后端服务或全套服务时，期望服务在启动阶段校验 `ReviewAIPrompt/` 中所需提示词文件存在且非空；若缺失应输出明确错误并中止启动，给出修复建议。

**Why this priority**: 提示词缺失会导致运行时行为不确定，按宪法要求服务应快速失败，避免隐性故障。

**Independent Test**: 在不修改代码的前提下，删除或清空某个 agent 的 system prompt 文件并启动服务，验证服务在启动日志中报出缺失文件并退出（非继续运行）。

**Acceptance Scenarios**:

1. **Given** 提示词文件存在且非空， **When** 启动服务， **Then** 服务继续启动并记录已加载提示词的路径。
2. **Given** 提示词文件缺失或为空， **When** 启动服务， **Then** 服务打印明确错误并停止启动，错误消息包含缺失文件路径与修复建议。

---

错误负载（PromptLoadError）约定：
- HTTP 状态：500
- code: "PROMPT_LOAD_ERROR"
- message: 中文可读错误提示
- details.missingPaths: string[] （缺失或语义性空白的提示词绝对路径）

### User Story 2 - 前端契约化调用与错误兜底 (Priority: P1)

前端在发起 `/orchestrate/review` 或相关 API 调用时，应仅依赖后端公开的 HTTP 接口与返回契约；UI 需对后端返回的错误（例如提示词加载失败、模型调用失败、识别返回 422）展示友好且可操作的错误信息，并在必要时提示用户如何重试或导出用于排查的 artifact。

**Why this priority**: 保证前端/后端解耦并提升可用性与可调试性。

**Independent Test**: 模拟后端返回 500 或特定错误代码，验证前端展示的错误信息包含必要的用户操作建议（重试、导出日志、联系维护者）。

**Acceptance Scenarios**:

1. **Given** 后端返回提示词加载错误， **When** 前端收到该错误， **Then** 展示“提示词缺失：请检查 ReviewAIPrompt/{agent} 下的文件，或联系维护者”，并提供“导出请求/响应”按钮。

---

### User Story 3 - README 与文档双语同步 (Priority: P2)

每个后端服务以及前端根目录必须包含中文与英文 README（`README.zh.md` 与 `README.md`），内容等效并包含：API 列表、示例调用、启动/停止步骤、依赖说明、运行时配置、以及 Mermaid 流程图。更新后的文档需与实际代码保持同步。

**Why this priority**: 满足宪法第8条与第5条文档中文化要求，便于维护与审计。

**Independent Test**: 打开 `services/circuit-agent/README.zh.md` 与 `README.md`，核对 API 列表与实际路由是否一致，并检查是否包含示例和 Mermaid 流程图。

**Acceptance Scenarios**:

1. **Given** README 已更新， **When** 运行文档检查脚本（人工或 CI）， **Then** 检查通过且无缺项列出。

---

### Edge Cases

- 当某一提示词文件格式正确但内容语义空白（例如仅包含空行）时，PromptLoader 应视为缺失并报错。
- 当本地环境未配置 `OPENROUTER_BASE` 且服务需要在线调用上游时，应在启动时提供明确的警告并以 fail-fast 行为处理。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 后端服务 MUST 在启动阶段执行 `PromptLoader.preloadPrompts()` 并对所有必需的提示词文件进行存在性与非空校验。任一环境下，若任一校验失败，必须在 10s 内 fail-fast 并中止启动（退出码非 0），并在错误负载与日志中包含缺失的绝对路径与修复建议。严禁以任何配置在服务进程内放宽该策略；如需排障，仅可在服务外部通过独立“预检脚本”进行临时跳过，且不影响服务进程的严格失败策略与 10s 退出时限。
- **FR-002**: 前端 MUST 对后端契约（HTTP 状态码与错误 payload）做容错，并在 UI 提供可操作的错误信息和导出诊断数据的途径。
- **FR-003**: 所有后端服务目录 MUST 包含 `README.md` 与 `README.zh.md`，二者内容等效。文档应包含 API 列表、示例、启动步骤与 Mermaid 流程图。
- **FR-004**: 代码库中所有公共模块定义处 MUST 包含中文结构化头部注释（用途、参数、返回、示例），并在实现任务中列为必做项。
- **FR-005**: 前端验收流程 MUST 包含 Playwright 或等效浏览器级自动化测试并将报告输出至 `frontend/test-reports/`。
- **FR-006**: 修改/新增的文件须在 `CURSOR.md` 中记录变更摘要并追加变更记录（位于文档末尾）。

- **FR-007**: 后端服务边界与独立性：不得通过共享数据库表、共享文件或进程间共享状态作为前后端或跨服务的主要交互手段；如存在此类交互，必须在修复计划中列出替代的网络契约与迁移策略。
- **FR-008**: 移除长期未使用代码：仓库中不得长期保留大量注释掉或废弃的实现。需要在审计中识别长期未触及的代码并列出清理计划或删除建议。
- **FR-009**: 代码生成合规性：所有由自动化工具（如 speckit/cursor）生成的代码或文档必须满足本宪法要求（提示词完整性、中文注释、契约化接口、测试门控等）；生成流程需包含合规性自检步骤或生成后校验脚本。
- **FR-010**: 配置管理与变更追踪：所有运行时或部署配置文件须纳入版本管理；配置变更必须在 PR 中包含变更说明、风险评估与回滚/迁移策略。
- **FR-011**: 实验性功能管理：所有实验性功能须通过 feature flag 或分支标注，并在引入前附带风险评估、回滚计划与测试策略；实验性功能不得破坏核心契约。
- **FR-012**: 测试门控与量化阈值：在本规范中建议设定可量化的门控阈值（例如关键 Playwright 场景通过率≥95%、单元/集成测试最低覆盖率建议 70%），这些阈值作为 PR 合并参考并在实现阶段可由维护者最终确认。
- **FR-013**: 头部注释模板细则（FR-004 的实现细则）：项目必须定义可被工具解析的头部注释模板（JSDoc/TSdoc 字段约定），并在 `specs/004-audit-constitution/comment-template.md` 中提供示例格式；T017/T024/T025/T026 的验收以该模板为准。
- **FR-014**: 治理与变更审查流程：对本次审计与修复所需的 PR 审批规则（至少两位审批者，其中一位为维护者）和紧急合并的回溯要求须在 Implementation Notes 中列明并在 CURSOR.md 中引用。

### Key Entities

- **PromptFile**: 表示单个提示词文档，属性：`path`、`lang`、`agent`、`variant`、`contentSummary`（非实现性描述）。
- **ServiceReadme**: 文档实体，属性：`path`、`language`、`sectionsPresent`。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 启动测试：在包含完整提示词的环境中，后端服务自检通过并在 30s 内完成预加载阶段；启动日志需打印预热开始/结束时间与耗时，健康端点可返回最近一次预热耗时指标（用于监控与验收）。
- **SC-002**: 恢复/失败路径：当缺失提示词时，服务在 10s 内打印明确错误并退出；CI 中应包含模拟缺失提示词的用例，并断言退出时限（≤10s）与错误文案（包含缺失路径与修复建议）。
- **SC-003**: 文档同步：所有后端服务目录中均存在 `README.md` 与 `README.zh.md`，且至少包含 5 个示例调用或说明段落。
- **SC-004**: 前端测试：Playwright 验证套件中关键场景通过率 ≥ 95%，并生成 HTML 报告放置在 `frontend/test-reports/`。

## Assumptions

- 默认仅对 `frontend/` 与 `services/circuit-agent/`（即单 agent 后端）进行修改，`services/circuit-fine-agent/` 暂不处理。
- 使用现有 `PromptLoader` 实现为基础进行增强，不在本次规范内重写加载机制。
- 若脚本无法在目标环境运行，规范和文档变更将以文件方式提交。

## Clarifications (已由用户确认)

### Session 2025-10-24

- Q1 测试与覆盖率阈值：接受默认 — Playwright 场景通过率 ≥ 95%，最低覆盖率建议 70%。 → A: Playwright 场景通过率 ≥95%，最低覆盖率 70%。
- Q2 注释覆盖范围：要求覆盖代码库中每个函数/方法（强制中文注释覆盖）。 → A: 每个函数/方法需有中文结构化注释。
- Q3 长期未使用代码处理策略：发现的长期未使用或注释掉的实现可直接删除，但必须通过 PR 审批并记录变更理由与回滚策略。 → A: 可删除，但需 PR 审批并记录回滚策略。
- Q4 启动时 Prompt 校验范围：校验该 agent 目录下的所有提示词文件均存在且非空（`preloadPrompts` 将对整个目录进行严格检查）。 → A: 校验整个 agent 目录下所有提示词文件均存在且非空。
- Q5 缺失提示词时的处理策略：任何环境均必须在 10s 内 fail-fast 并中止启动；日志与错误负载需包含缺失的绝对路径与修复建议。用于排障的“预检脚本”可单独提供跳过开关，但不影响服务进程的严格失败策略与 10s 退出时限（服务进程内不得放宽）。

## Implementation Notes (do not include low-level HOW in spec)

- 本节仅列出高层实施注意事项：确保启动时的校验为 fail-fast、文档更新为双语、并在代码审查时强制补全中文头部注释。

## Implementation Decisions

- **Frontend-backend contract fixes**: 本次实施原则上**不自动修改**前端与后端之间的契约（字段名、路径等）。发现明确不兼容项时，我将把该问题列入修复任务清单并在实施前向你确认具体变更与回滚策略。

---

End of spec
