# Quickstart: 校验并修复宪法违规项（开发者向导）

1. 在仓库根运行一键脚本启动服务：

```powershell
node start-all.js
```

2. 本地校验必需提示词：

```powershell
node services/circuit-agent/dist/bootstrap/server.js --check-prompts
```

示例输出（缺失场景）：

```text
ERROR: Missing prompt file: ReviewAIPrompt/circuit-agent/system_prompt_initial_zh.md
Service exiting with code 1
```

本地调试建议：如果上述命令在 dev 模式下不可用，请使用 `node services/circuit-agent/src/bootstrap/server.ts`（或等价的 ts-node/tsx 启动方式）并观察控制台输出；也可运行 `specs/003-validate-code-against-constitution/check-missing-prompts.ps1` 来临时模拟该场景。

3. 运行前端 E2E（Playwright，若已安装）：

```bash
cd frontend
npx playwright test --reporter=list,html --output=./test-reports
```

4. 手动检查项：
- 确认 `ReviewAIPrompt/circuit-agent/` 中的中文提示词存在且非空
- 确认 `services/circuit-agent/README.md` 与 `README.zh.md` 同步


