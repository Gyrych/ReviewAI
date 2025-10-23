param(
  [string]$RepoRoot = "$(Resolve-Path ..)"
)

# 简单脚本：临时重命名或移动 ReviewAIPrompt/circuit-agent 下的文件以模拟缺失情形
$promptDir = Join-Path -Path $RepoRoot -ChildPath "ReviewAIPrompt/circuit-agent"
if (-not (Test-Path $promptDir)) {
  Write-Error "Prompt dir not found: $promptDir"
  exit 2
}

$tmp = Join-Path $promptDir "__tmp_backup__"
Move-Item -Path (Join-Path $promptDir "*") -Destination $tmp -Force -ErrorAction SilentlyContinue
if (Test-Path $tmp) {
  Write-Host "Simulated missing prompts by moving files to $tmp" -ForegroundColor Yellow
  # Exit non-zero to indicate missing prompts
  exit 3
} else {
  Write-Host "No prompts moved. Check failed." -ForegroundColor Red
  exit 1
}


