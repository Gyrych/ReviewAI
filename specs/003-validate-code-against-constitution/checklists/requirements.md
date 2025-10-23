# 规范质量检查清单: 校验前端与 circuit-agent 对照 ReviewAI 宪法

**目的**: 在进入规划阶段之前验证规范的完整性和质量
**创建日期**: 2025-10-23
**功能**: `specs/003-validate-code-against-constitution/spec.md`

## 内容质量

- [x] 无实现细节（语言、框架、API）

  Acceptance: 文档不得包含具体实现技术栈或 API 细节；如需记录实现内容，须放入 `implementation-notes.md` 附录。验证方法：全文检索（关键字如 `Node` `React` `Vite` `Express` `API`）无条目或仅出现在 `implementation-notes.md` 中。

- [x] 关注用户价值和业务需求

  Acceptance: 每项需求开头包含一句业务价值声明（Why）；随机抽样 100% 覆盖并由产品负责人确认。

- [x] 面向非技术利益相关者编写

  Acceptance: 通过一次非技术审阅（由至少一名非工程利益相关者阅读并确认可理解）。

- [x] 所有必填部分已完成

  Acceptance: 文件包含目的、范围、验收标准、依赖、风险与里程碑；使用 `specs/003-validate-code-against-constitution/validation-checklist.md` 进行自动化验证。

## 需求完整性

- [x] 无 [NEEDS CLARIFICATION] 标记

  Clarification: 本清单中原先存在的“NEEDS CLARIFICATION”项已在下文对应条目中以“Acceptance / 验收标准”形式回答；如需进一步细化，请在 `specs/003-validate-code-against-constitution/speckit.clarify.md` 中提交具体问题。

- [x] 需求可测试且明确

  Acceptance: 每项需求均包含至少一条 Given/When/Then 格式的验收场景；使用 `specs/003-validate-code-against-constitution/validation-checklist.md` 验证每条需求的 GWT 存在性。

- [x] 成功标准可衡量

  Acceptance: 成功标准采用可量化指标（例如：E2E 覆盖率、响应时间、错误率、输出文件路径与退出码等）。

- [x] 成功标准与技术无关（无实现细节）

  Acceptance: 成功标准不包含实现方法；若需描述实现约束，放入 `implementation-notes.md`。

- [x] 所有验收场景已定义

  Acceptance: 每个主要功能至少定义一条验收场景并登记在 `validation-checklist.md` 中。

- [x] 边界情况已识别

  Acceptance: 对每个功能列出主要边界情况与失败路径，含示例输入与期望输出。

- [x] 范围明确界定

  Acceptance: 通过范围段落与不在范围的明确排除项来界定功能边界。

- [x] 已识别依赖关系和假设

  Acceptance: 在依赖段列出外部服务/环境变量（例如 `OPENROUTER_BASE`、`STORAGE_ROOT`、`REDIS_URL`）并在 `tasks.md` 中列出验证任务（见 T005/T006）。

## 具体检查项（建议纳入自动化验证）

- [x] `frontend/test-reports/` 目录存在且能生成 E2E 报告（JSON/HTML）

  Acceptance: 在 `frontend/package.json` 中存在 `test:e2e` 脚本（示例：`npx playwright test --reporter=list,html --output=./test-reports`），执行后 `frontend/test-reports/` 包含 `report.html` 与 `results.json`。

- [x] 前端 E2E 覆盖率达到或有计划达到 ≥90%（或在说明中列出提升里程碑）

  Acceptance: 若当前覆盖率 <90%，在 `specs/003-validate-code-against-constitution/e2e-coverage-plan.md` 中列出分阶段目标（6 周/3 个月）与负责人。

- [x] `services/circuit-agent` 在启动时验证 `OPENROUTER_BASE`、`STORAGE_ROOT`、`REDIS_URL` 并在缺失或无效时输出明确错误

  Acceptance: 在 `services/circuit-agent/src/config/config.ts` 提供 `validateRuntimeConfig()` 并在 `bootstrap/server.ts` 启动前调用；缺失时记录 `Missing config: <NAME>` 并 `process.exit(1)`。

- [x] 仓库中无长期被跟踪的 build/dist 产物，或这些产物已在 `.gitignore` 中并在 README/CURSOR.md 中说明处理策略

  Acceptance: `.gitignore` 含 `frontend/dist/` 与 `services/*/dist/`；`specs/003-validate-code-against-constitution/audit-dist-artifacts.md` 列出当前受影响路径与处理建议。

- [x] 前端代码无跨目录导入后端源码（静态扫描）

  Acceptance: 运行 `node scripts/check-frontend-no-backend-imports.js` 输出 0 forbidden imports 或修复清单已更新并同步到 `tasks.md`（见 T015）。

- [x] 对关键后端模块进行注释覆盖度抽样检查，目标覆盖率 ≥90%（或列为改进计划）

  Acceptance: 运行 `scripts/sample-chinese-docs.js` 生成 `specs/003-validate-code-against-constitution/chinese-docs-report.json`，报告包含覆盖率并指定改进计划（若 <90%）。

- [x] 为每项不通过的检查列出修复建议及可能修改的文件位置

  Acceptance: `specs/003-validate-code-against-constitution/validation-checklist.md` 对每条不通过项列出修复建议与可能变更文件路径，且已在 `tasks.md` 中创建对应 T### 任务。

## 功能准备度

- [x] 所有功能需求具有明确的验收标准

  Acceptance: 每个功能在 `validation-checklist.md` 中至少含一条 GWT 场景。

- [x] 用户场景覆盖主要流程

  Acceptance: 列出主要用户场景并标注现状（已覆盖/需新增测试）。

- [x] 功能满足可衡量的成功标准

  Acceptance: 每项成功标准已量化并可通过工具度量。

- [x] 规范中无实现细节泄露

  Acceptance: 经全文检索与人工审阅，确认无实现细节泄露（见前文“内容质量”）。

## 备注

- 标记为未完成的项目需要在 `/speckit.clarify` 或 `/speckit.plan` 之前更新规范
