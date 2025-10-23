---
Decision Log: research results for `003-validate-code-against-constitution`
Date: 2025-10-23
---

1) PromptLoader runtime enforcement
- Decision: 保持并强化当前 `PromptLoader` 启动校验逻辑，要求在 `src/bootstrap/server.ts` 启动路径调用 `PromptLoader.preloadPrompts()` 并在检测到缺失/空文件时抛出并退出（fail-fast）。
- Rationale: 宪法第1条强制要求提示词完整性；已有代码与 README 指示 `PromptLoader` 存在，但需确认实际启动路径调用位置与错误处理策略一致。
- Alternatives considered: 修改为启动时警告而非退出；被拒绝因为违背宪法快速失败要求。

2) OPENROUTER_BASE defaulting vs required
- Decision: 将 `OPENROUTER_BASE` 保留默认值用于开发便捷，但在正式合规检查（本计划 gate）中要求明确配置或 CI 将其注入测试环境；`services/circuit-agent` 在启动时若检测到运行在 CI/production 环境且仍使用默认值应视为不合格并失败。
- Rationale: 默认值方便开发，但合规环境需显式配置以避免在生产中误连错误上游。
- Alternatives: 强制所有环境必须显式提供 `OPENROUTER_BASE`（对开发不友好），故采用混合策略。

3) 前端 E2E 测试与 `frontend/test-reports/`
- Decision: 引入 Playwright 作为首选 E2E 框架并在 `frontend/package.json` 添加 `test:e2e` 脚本，配置输出目录为 `frontend/test-reports/`（JSON+HTML）。
- Rationale: Playwright 易于在 CI 与本地运行，能生成多种报告格式。该决策需用户确认是否接受 Playwright。若用户不接受，可改用 Cypress。
- Alternatives considered: Cypress（功能等效，选 Playwright 因无浏览器启动许可限制且易于无头运行）。

- 4) 后端测试覆盖情况
- Decision: 选择使用 `vitest` 作为后端测试框架，并在 `services/circuit-agent` 中添加基础测试目录 `tests/`、示例单元测试与 CI 占位脚本。
- Rationale: `vitest` 与 Vite/TypeScript 生态兼容、上手快且支持运行在 Node 环境，适合增量添加单元/集成测试；也便于在 CI 中并行运行并输出机器可读报告。
- Alternatives considered: `node:test`（原生、轻量但生态工具支持较弱），`jest`（成熟但配置较重）；因项目已使用 Vite/TypeScript，选 `vitest` 以减少配置成本。

5) README 双语同步策略
- Decision: 保持现有 `services/circuit-agent/README.md` 与 `README.zh.md`，在后续任务中添加校验脚本或手动检查清单以保证更新时同步修改 `CURSOR.md`。
- Rationale: 两份 README 已存在，需确保同步流程而非立即重写内容。

- 6) Summary of resolved NEEDS CLARIFICATION
- 前端 E2E 测试框架选择：Playwright（已由用户确认）
- 后端测试：已选择 `vitest` 作为后端测试框架
- OPENROUTER_BASE：允许默认用于开发，但 CI/生产要求显式注入


