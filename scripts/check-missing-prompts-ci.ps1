Param(
  [string]$AgentDir = "./ReviewAIPrompt/circuit-agent",
  [int]$TimeoutSec = 10
)

$ErrorActionPreference = 'Stop'

# 1) 选择一个必需的提示词并暂存移动
$required = Join-Path $AgentDir 'system_prompt_initial_zh.md'
if (!(Test-Path $required)) {
  Write-Error "必需提示词不存在：$required"
}
$backup = "$required.bak_ci"
Move-Item -Force $required $backup
Write-Host "[T033] 暂时移走提示词：$required"

try {
  # 2) 启动后端（预热严格），期待在 $TimeoutSec 内退出且为非 0
  $start = Get-Date
  $proc = Start-Process -FilePath "node" -ArgumentList "services/circuit-agent/src/bootstrap/server.ts" -NoNewWindow -PassThru
  $exited = $false
  for ($i=0; $i -lt $TimeoutSec*10; $i++) {
    Start-Sleep -Milliseconds 100
    if ($proc.HasExited) { $exited = $true; break }
  }
  if (-not $exited) {
    try { $proc.Kill() } catch {}
    throw "进程在 ${TimeoutSec}s 内未退出（未满足 fail-fast）"
  }
  if ($proc.ExitCode -eq 0) { throw "退出码为 0，未满足 fail-fast 非零退出" }
  Write-Host "[T033] 进程在时限内以非零退出，满足 SC-002。"
}
finally {
  # 3) 还原提示词
  if (Test-Path $backup) { Move-Item -Force $backup $required }
}

exit 0


