# Implementation Notes — 003-validate-code-against-constitution

本文件记录实现要点、设计权衡与回滚策略，便于维护者理解自动化变更的理由。

- Prompt 校验：在 `services/circuit-agent` 中实现 `PromptLoader` 与 `PromptValidator`，在启动时预热提示词 (`preloadPrompts`) 并写入 `specs/.../prompt-validation.json`。设计决策：预热可减少首次请求 latency，但预热失败（缺失提示词）会触发 fail-fast 确保合规性。

- 运行时配置：`validateRuntimeConfig()` 集中校验 `OPENROUTER_BASE`、`STORAGE_ROOT` 与 `REDIS_URL`。若 `OPENROUTER_BASE` 在生产/CI 必须显式配置，开发模式允许默认值。

- 前端配置：将后端基路径改为运行时读取（`frontend/src/config/apiBase.ts`），支持 `VITE_API_BASE` / `VITE_CIRCUIT_BASE` 等覆盖。

- 注释抽样：实现 `scripts/sample-chinese-docs.js` 生成 `specs/.../chinese-docs-report.json`。该脚本用于抽样评估中文注释覆盖率并指导文档补充工作。

- CI 与测试：已添加 Playwright 示例测试与占位的 `test:unit` 脚本；建议在 CI 中添加 Playwright 作业并使用 `frontend/test-reports/` 作为 artifact 路径。

回滚策略：
- 若某次变更导致问题，优先回退对应文件（例如 `PromptValidator`、`bootstrap/server.ts` 的校验逻辑），并在 `CURSOR.md` 中记录回滚时间与原因。


