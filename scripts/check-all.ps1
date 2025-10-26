Param(
  [string]$E2EThreshold = "0.95"
)

$ErrorActionPreference = 'Stop'
Write-Host "[check:all] 开始综合校验..."

# 1) 提示词完整性
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/check-prompts.ps1 -AgentDir ./ReviewAIPrompt/circuit-agent

# 2) README 必需章节
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/check-readme-sections.ps1 -ServiceDir ./services/circuit-agent

# 3) 中文头注覆盖（生成/更新覆盖率报告）
bash ./scripts/check-head-comments.sh . docs/comment-coverage-report.json

# 4) 合约一致性
node ./scripts/check-contract-implementation.js

# 5) 前端 E2E（安装浏览器 + 运行 + 阈值校验）
Push-Location frontend
try {
  npx --yes playwright install chromium | Out-Null
  npx --yes playwright test --reporter=list,json --output=./test-reports --config=playwright.config.ts
} finally { Pop-Location }
node ./scripts/check-e2e-threshold.js $E2EThreshold

# 6) 后端 Vitest 覆盖率
Push-Location services/circuit-agent
try {
  npm i -D @vitest/coverage-v8 --silent | Out-Null
  npx --yes vitest run --coverage
} finally { Pop-Location }

Write-Host "[check:all] 全部校验通过"
exit 0


