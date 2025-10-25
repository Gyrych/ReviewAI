# quickstart.md

简短快速上手：

1. 安装依赖：

```powershell
npm install
cd frontend
npm install
cd ../services/circuit-agent
npm install
```

2. 启动（本地开发）：

```powershell
# 在仓库根目录
node start-all.js
```

3. 运行 Playwright 验证（生成报告）：

```powershell
cd frontend
npx playwright test --reporter=list,html --output=./test-reports --config=playwright.config.ts
```

4. 检查提示词完整性：

```powershell
# 手动校验示例：检查某 agent 的 system prompt 是否存在且非空
Get-Content -Path .\ReviewAIPrompt\circuit-agent\system_prompt_initial_zh.md -ErrorAction Stop
```

5. 运行验证脚本（建议在 CI pre-merge 中调用）：

```powershell
# 校验提示词完整性
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-prompts.ps1 -AgentDir .\ReviewAIPrompt\circuit-agent

# 校验 README 必需章节
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-readme-sections.ps1 -ServiceDir .\services\circuit-agent
```



