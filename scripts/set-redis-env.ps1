# 临时将 REDIS_URL 设置到当前 PowerShell 会话
param(
  [string]$Url = 'redis://localhost:6379'
)

$env:REDIS_URL = $Url
Write-Host "Set REDIS_URL=$Url for current PowerShell session"


Write-Host "To persist the environment variable across sessions, run:`nsetx REDIS_URL `\"$Url`\""


