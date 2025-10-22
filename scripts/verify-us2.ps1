param(
  [Parameter(Mandatory=$true)][string]$ApiKey
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent $PSScriptRoot
$tmpDir = Join-Path $repoRoot "tmp"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

$headers = @{ Authorization = "Bearer $ApiKey" }

# 基础表单（ASCII 以避免转义问题）
$formCommon = @{
  requirements = "Please produce a revision review"
  specs        = "Spec delta"
  dialog       = "User objections"
  language     = "en"
  directReview = "true"
  apiUrl       = "https://openrouter.ai/api/v1/chat/completions"
  model        = "openai/gpt-4o-mini"
}

# 构造带有 assistant 历史且包含 '## Metadata' 标记以触发修订判定
$history = '[{"role":"assistant","content":"## Metadata\nPrev review report"}]'

$formRev = $formCommon.Clone()
$formRev.enableSearch = "false"
$formRev.history = $history

$resp = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:4001/api/v1/circuit-agent/orchestrate/review" -Method Post -Headers $headers -Form $formRev

$out = Join-Path $tmpDir "us2_revision.json"
$resp.Content | Out-File -FilePath $out -Encoding utf8
Write-Host "[verify-us2] Output: $out" -ForegroundColor Green

