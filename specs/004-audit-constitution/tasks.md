---
description: Actionable, dependency-ordered task list generated from spec.md and plan.md for feature `004-audit-constitution`.
generated_by: speckit.tasks
---

# tasks.md — 实施任务（已翻译为中文）

> 说明：此文件由 `/speckit.tasks` 生成，按用户故事分 Phase，所有任务均采用严格的 checklist 格式（示例：`- [ ] T001 [P] [US1] 描述 (文件路径)`）。

---

Phase 1 — 初始化（项目准备与先决检查）

- [X] T001 [Support] 运行前置检查脚本并记录 FEATURE_DIR 与 AVAILABLE_DOCS（`.specify/scripts/powershell/check-prerequisites.ps1`）
 - [X] T002 [P] [Support] 使用现有脚本执行提示词完整性校验并保存输出（`scripts/check-prompts.ps1`）
 - [X] T003 [Support] 确保 Playwright 报告目录存在并在 `specs/004-audit-constitution/quickstart.md` 中记录运行命令（`specs/004-audit-constitution/quickstart.md`）

Phase 2 — 基础准备（所有用户故事前的阻塞项）

- [X] T004 在服务启动流程中调用 `PromptLoader.preloadPrompts()` 并在出现 `PromptLoadError` 时以可操作的错误信息退出进程（`services/circuit-agent/src/bootstrap/server.ts`）
- [X] T005 修改 `services/circuit-agent/src/infra/prompts/PromptLoader.ts`，增加严格预热模式（遇到缺失或空文件立即抛出）并记录使用说明（`services/circuit-agent/src/infra/prompts/PromptLoader.ts`）
- [X] T006 在 CI 或仓库说明中添加/校验提示词检查脚本的调用（更新 `package.json` 文档或 `.github/workflows/*`）（`package.json`、`.github/workflows/*`（如存在））

- [X] T020 在配置中添加 `PROMPT_PRELOAD_STRICT` 环境变量支持（默认 true），并在 `services/circuit-agent/src/config/config.ts` 中读取该配置；在 `bootstrap/server.ts` 中：任何环境下服务进程一律严格预热，缺失即 fail-fast（忽略任何放宽开关）；`PROMPT_PRELOAD_STRICT` 仅供外部“预检脚本”使用，不影响服务进程行为（`services/circuit-agent/src/config/config.ts`、`services/circuit-agent/src/bootstrap/server.ts`）
- [X] T021 [P] 添加合约與实现一致性检查脚本 `scripts/check-contract-implementation.js`，用于比较 `specs/004-audit-constitution/contracts/openapi.yaml` 与 `services/circuit-agent/src/interface/http/routes/` 的路由实现并在检测到不一致时返回非零退出码（`scripts/check-contract-implementation.js`）

Phase 3 — 用户故事（按优先级依次实现）

US1 — 启动检查与提示词完整性验证（优先级：P1）

目标：在启动阶段校验 `ReviewAIPrompt/{agent}` 下所有必需提示词文件存在且非空；若缺失应在 10s 内输出明确错误并根据规范行为退出或记录警告。

独立测试：在不修改源代码的前提下，删除或清空某个 system prompt 并启动服务，验证启动日志包含缺失信息并按设定行为退出或记录（见 Acceptance Scenarios）。

- [X] T007 [US1] 新增单元/集成测试，模拟缺失提示词并验证 `PromptLoader` 抛出 `PromptLoadError`（位置：`services/circuit-agent/tests/promptloader.spec.ts`）
- [X] T008 [US1] 在启动流程中记录成功预热时加载的提示词绝对路径（`services/circuit-agent/src/bootstrap/server.ts`）
- [X] T009 [US1] 实现清晰的启动错误信息，列出缺失/为空的提示词路径并给出修复建议（`services/circuit-agent/src/bootstrap/server.ts`）

US2 — 前端契约化调用与错误兜底（优先级：P1）

目标：前端在遇到后端契约错误时展现友好且可操作的界面，并支持导出请求/响应等诊断 artifact。

独立测试：模拟后端返回提示词加载错误或 5xx，验证前端显示“导出请求/响应”按钮并能调用导出接口获取 artifact URL。

- [X] T009A [US2] 实现后端路由 `POST /api/v1/circuit-agent/diagnostics/export` 并返回 `201 + { artifactUrl }`（依赖 `contracts/openapi.yaml`）
- [X] T010 [US2] 添加可复用前端组件 `ErrorDiagnostic.tsx`，用于渲染可操作的错误信息并提供“导出诊断”按钮（`frontend/src/components/ErrorDiagnostic.tsx`）
- [X] T011 [US2] 在全局 API 错误处理处集成 `ErrorDiagnostic`（例如 `frontend/src/config/apiBase.ts`）
- [X] T012 [P] [US2] 在前端实现调用诊断导出接口 `/api/v1/circuit-agent/diagnostics/export` 并处理返回的 `artifactUrl`（`frontend/src/components/ErrorDiagnostic.tsx`）
- [X] T013 [US2] 添加 Playwright 场景：模拟后端 `PromptLoadError` 响应，断言页面显示“导出诊断”按钮并完成 artifact 导出流程（`frontend/tests/e2e/diagnostics.spec.ts`）

US3 — README 与文档双语同步（优先级：P2）

目标：确保 `services/circuit-agent/` 与 `frontend/` 根目录包含等效的 `README.md` 与 `README.zh.md`，包含 API 列表、示例调用、启动/停止、依赖说明与 Mermaid 流程图。

独立测试：运行 `scripts/check-readme-sections.ps1` 并确保通过检查。

- [X] T014 [US3] 更新 `services/circuit-agent/README.md`，补充 API 列表、示例调用、启动/停止、依赖说明与 Mermaid 流程图（`services/circuit-agent/README.md`）
- [X] T015 [US3] 新建/更新中文对等文档 `services/circuit-agent/README.zh.md`（`services/circuit-agent/README.zh.md`）
- [X] T016 [US3] 更新 `frontend/README.md` 与 `frontend/README.zh.md`，包含使用说明、Playwright 执行步骤与 Mermaid 概述（`frontend/README.md`、`frontend/README.zh.md`）

Final Phase — 打磨与横切关注点

- [X] T017 [P] 确保所有公共函数/类/模块包含结构化中文头部注释（按宪法第10/17条扫描并补全）（`services/circuit-agent/src/**`、`frontend/src/**`）
  - 完成定义：扫描上述路径（排除 `**/*.d.ts`、编译产物、第三方依赖），对所有公开导出的函数/类/模块定义处加中文结构化头注（用途、参数、返回/异常、最小示例）。
  - 产物：`docs/comment-coverage-report.json`（由 `scripts/check-head-comments.sh` 生成）；CI 失败即阻断合并。
- [x] T018 [P] 向 `CURSOR.md` 追加本次变更摘要及日期（`CURSOR.md`）
- [X] T019 [P] 运行 `scripts/check-prompts.ps1` 与 `scripts/check-readme-sections.ps1`，验证退出码为 0，并记录任何需人工修复的步骤（`scripts/check-prompts.ps1`、`scripts/check-readme-sections.ps1`）

---

新增任务（治理/门控/指标）

- [X] T022 [P] 修订规范：更新 `specs/004-audit-constitution/spec.md` 的 FR-001 与 Clarifications Q5（生产严格失败；开发/调试可显式关闭 Strict Preload）
- [X] T023 [P] 文档同步：在 `services/circuit-agent/README.md` 与 `README.zh.md` 增补 Strict Preload 策略与配置示例（含故障排查）
- [X] T024 注释覆盖审计：扫描 `services/circuit-agent/src/**` 与 `frontend/src/**` 公共导出，产出缺口清单（遵循 `comment-template.md`）
- [X] T025 注释补齐实施：优先补齐接口/用例/路由/存储等关键模块头注（中文结构化）
- [X] T026 注释门控接入：将 `scripts/check-head-comments.sh` 接入 CI，失败阻止合并
- [X] T027 服务边界审计：识别跨服务共享状态/文件/DB，并提出契约化替代与迁移计划（覆盖 FR-007）
- [X] T028 废弃代码清理：识别与清理长期未触达/注释大段的实现，附回滚策略（覆盖 FR-008）
  - 产物：`docs/dead-code-report.md`（包含长期未改动文件、未被引用的导出符号清单、注释大段实现示例）。
  - 建议脚本：`npx ts-prune > docs/dead-code-report.md`；`npx depcruise src --output-type text >> docs/dead-code-report.md`（仅建议，需人工复核）。
- [X] T029 生成物合规自检：整合 prompts/README/注释/契约一致性检查，产出 `analysis-report.md`（覆盖 FR-009）
- [X] T030 实验功能治理：定义 feature flag 规范、回滚模板与测试策略；梳理现存实验标识（覆盖 FR-011）
- [X] T031 PR 审批与回溯：在 `CURSOR.md` 增补“≥2 审批者（含维护者）+ 紧急回溯要求”，并在 CI 校验（覆盖 FR-014）

US1 追加指标任务

- [X] T032 预热耗时埋点：在 `services/circuit-agent/src/bootstrap/server.ts` 记录预热耗时并在健康端点暴露指标（覆盖 SC-001）
- [X] T033 缺失提示词失败用例：CI 中模拟缺失提示词并断言 ≤10s 失败与明确错误文案（覆盖 SC-002）

测试阈值门控

- [X] T034 [P] 前端测试阈值门控：集成 Playwright 关键场景 ≥95% 的门槛与报告归档（`frontend/package.json`、CI 配置）
- [X] T035 [P] 后端测试阈值门槛：集成 Vitest 覆盖率 ≥70% 的门槛与报告归档（`services/circuit-agent/package.json`、CI 配置）

---

依赖关系（高层）

- Foundational（T004、T005、T006）须在任何用户故事任务前完成。
- US1（T007、T008、T009）应在 US2（T010..T013）之前完成，以确保后端提供可供前端消费的清晰错误负载。

并行执行机会

- **T002** 与 **T003** 可与其它只读文档任务并行（已标记 `[P]`）。
- **T010**、**T011**、**T012**（前端工作）在基础任务完成后可与后端测试并行进行，前提是 `/diagnostics/export` 接口契约稳定。
- **T017**、**T018**（文档/注释）可跨文件并行处理（标记 `[P]`）。
- **T021**（合约一致性检查）可与 T006（CI 校验）并行运行，用于早期捕获契约与实现不一致问题。

实施策略（MVP 优先）

- MVP 范围：首先交付 US1（启动检查与提示词完整性验证），以在 CI 与本地开发时尽早避免提示词缺失导致的隐性故障。
- 之后按顺序交付 US2（前端错误处理）与 US3（文档同步），最后进行打磨与横切关注点处理。

报告与校验

- 生成文件路径：`specs/004-audit-constitution/tasks.md`
- 总任务数：35（T001..T035）
- 各相/故事/新增任务数：
  - Phase 1（初始化）：3
  - Phase 2（基础准备）：5
  - US1：3
  - US2：4
  - US3：3
  - Final Phase：3
  - 新增任务（治理/门控/指标）：10
  - US1 追加指标任务：2
  - 测试阈值门控：2
- 已识别并行机会：T002、T003、T012、T017、T021

下面是逐项核对结果与建议（基于 `plan.md`、`spec.md`、`data-model.md`、`research.md`、`quickstart.md` 与 `contracts/openapi.yaml`）：

一、 一致性校验

- 大多数任务与 `spec.md` 的功能需求（FR-001..FR-006）对齐；提示词校验、前端错误兜底、README 双语同步均被覆盖。
- `contracts/openapi.yaml` 中定义了 `/diagnostics/export`，任务 T012 已覆盖前端对该接口的调用。

二、 遗漏与建议

- 建议新增配置项任务：在基础准备中加入环境变量或配置开关（例如 `PROMPT_PRELOAD_STRICT=true|false`）以切换严格预热与宽容模式，便于在不同环境中控制 fail-fast 行为（建议新增任务：在 `services/circuit-agent` 中添加配置支持并在 `bootstrap/server.ts` 中读取）。
- 建议补充契约验证任务：验证 `specs/004-audit-constitution/contracts/openapi.yaml` 与实际实现路由（`services/circuit-agent/src/interface/http/routes/*.ts`）的一致性，避免契约/实现不符（建议新增任务：合约到实现映射检查）。
- T018（追加 `CURSOR.md` 变更记录）已执行且标记为完成；建议将任务在追踪系统中同步标记为已完成。

三、 表述不清 / 歧义点

- 核心冲突：`spec.md` 中 FR-001 要求启动时抛出异常并停止（fail-fast），但 Clarifications Q5 表示在缺失提示词时记录警告并继续加载其它提示词。建议通过配置开关使行为可切换（参见建议新增 T020）。
- 对 T007 的测试建议：使用 `vitest`，在 `services/circuit-agent/tests/promptloader.spec.ts` 中模拟缺失场景（可通过临时移动/重命名 `ReviewAIPrompt/circuit-agent` 下的文件）来验证 `PromptLoader` 行为，以满足“无需修改源代码”的独立测试要求。
- T004 与 T005 的分工建议：T005 实现严格预热模式的可选 API（例如 `preloadPrompts({ strict: boolean })` 或由环境变量控制），T004 在服务启动处根据配置调用并决定退出或记录警告。

四、 可执行性评估

- 当前所有任务均包含目标文件路径，具备可执行性。少量任务（如 T007 的测试实现步骤、T006 的 CI 配置位置）建议在实施前补充一行执行命令或示例。

五、 建议修改（优先级）

- 高优先级：新增 T020（`PROMPT_PRELOAD_STRICT` 配置支持）。
- 中优先级：新增 T021（合约实现一致性检查脚本）。
- 小幅调整：将 T018 在任务追踪系统中标记为已完成（文件内已标注）。

六、 其它注意事项

- `services/circuit-agent/src/infra/prompts/PromptLoader.ts` 当前 `preloadPrompts` 在遇到错误时仅记录并继续，这与 FR-001 的 strict 要求不一致；T005 需修改或新增可选行为以支持严格模式。
- 请确认 Playwright 报告路径与 `quickstart.md` 中的命令一致（`frontend/test-reports/`），以便 T003 验证。

下一步我可以：

- 如果你同意，我将继续为 T020 与/或 T021 撰写代码草案并提交变更；请回复 “实现 T020” 或 “实现 T021” 或同时回复两者。
