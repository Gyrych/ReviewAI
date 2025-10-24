# Validation Checklist — 003-validate-code-against-constitution

本清单用于逐条验证 `specs/003-validate-code-against-constitution/spec.md` 中的 Acceptance Scenarios 与 `checklists/requirements.md` 的检查项，便于 CI/人工逐项核验。

如何使用：每一条按步骤执行并记录实际结果（PASS/FAIL/NA）与证据（日志、文件路径、报告）。

1) FR-001 提示词完整性（Prompt files）
  - 步骤：运行 `node --prefix services/circuit-agent src/bootstrap/server.ts` 或 `npm run start`（在 dev 环境可用 tsx），观察启动日志；若使用 CI，可运行 `specs/.../check-missing-prompts.ps1` 模拟缺失。
  - 预期：当缺失任一必需提示词时，进程以非 0 退出并在日志中列出缺失文件路径；当完整时，`specs/003-validate-code-against-constitution/prompt-validation.json`（或 `specs/.../prompt-validation.json`）存在并列出文件与 sha256。

2) FR-002 启动可控性（Runtime config）
  - 步骤：在 CI 环境不设置 `OPENROUTER_BASE`，启动服务并断言失败；另外在本地设置正确 `STORAGE_ROOT` 并确认启动成功。
  - 预期：当关键 env 缺失或 STORAGE_ROOT 不存在时，`validateRuntimeConfig()` 返回错误并导致 `process.exit(1)`。

3) FR-003 前后端解耦 (no cross-imports)
  - 步骤：运行 `node scripts/check-frontend-no-backend-imports.js`。
  - 预期：脚本退出码 0 且输出 `No cross-imports detected`；若发现违规，记录文件列表并修复。

4) FR-004 README 双语完整性
  - 步骤：查看 `specs/.../readme-sync-check.md` 的比对结果；如需修改，应用变更并记录 commit（或在 CURSOR.md 记录变更）。
  - 预期：关键段落（API、启动、依赖）在两份 README 中等效或已列明接受差异。

5) FR-005 中文注释覆盖度
  - 步骤：运行 `node scripts/sample-chinese-docs.js`，查看 `specs/.../chinese-docs-report.json`。
  - 预期：抽样覆盖率达成目标（当前目标 ≥90% 或已在 e2e-coverage-plan.md 中列出改进里程碑）。

6) FR-006 前端自动化测试基础
  - 步骤：运行 `npm --prefix frontend run test:e2e`（需先安装依赖并启动前端服务）；保存 `frontend/test-reports/`。
  - 预期：报告包含 HTML 与 JSON，路径为 `frontend/test-reports/playwright-html` 与 `frontend/test-reports/playwright-results.json`（或按配置）。

7) FR-007 Dist artifact audit
  - 步骤：查阅 `specs/.../audit-dist-artifacts.md` 并确认 `.gitignore` 包含相应 ignore 条目。

8) FR-008 配置与文档同步
  - 步骤：确认 `CURSOR.md` 已追加变更记录并与 README/任务保持一致。

每项验证完成后，在本清单下方记录验证者、时间与证据链接。

---

签署记录（产品负责人）:

- Name: ____________________
- Date: ____________________
- Notes: ____________________

非技术人员可读性审阅记录（输出: `specs/003-validate-code-against-constitution/nontechnical-review.md`）:

- Reviewer: ____________________
- Date: ____________________
- Conclusion: ____________________



