param(
  [Parameter(Mandatory=$true)][string]$ApiKey
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent $PSScriptRoot
$tmpDir = Join-Path $repoRoot "tmp"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

$headers = @{ Authorization = "Bearer $ApiKey" }

# 公共表单字段
$formCommon = @{
  requirements = "请根据规范输出 Markdown 评审"
  specs        = "PCB 走线与电源去耦规范"
  dialog       = "首次提交"
  language     = "zh"
  directReview = "true"
  apiUrl       = "https://openrouter.ai/api/v1/chat/completions"
  model        = "openai/gpt-4o-mini"
}

$filePath = Join-Path $repoRoot "test/实例电路.png"
if (-not (Test-Path $filePath)) { throw "示例图片不存在: $filePath" }

# 1) 禁用检索
$formNoSearch = $formCommon.Clone()
$formNoSearch.files = Get-Item $filePath
$formNoSearch.enableSearch = "false"
$resp1 = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:4001/api/v1/circuit-agent/orchestrate/review" -Method Post -Headers $headers -Form $formNoSearch
$out1 = Join-Path $tmpDir "us1_no_search.json"
$resp1.Content | Out-File -FilePath $out1 -Encoding utf8

# 2) 启用检索（topN=2）
$formSearch = $formCommon.Clone()
$formSearch.files = Get-Item $filePath
$formSearch.enableSearch = "true"
$formSearch.searchTopN = "2"
$resp2 = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:4001/api/v1/circuit-agent/orchestrate/review" -Method Post -Headers $headers -Form $formSearch
$out2 = Join-Path $tmpDir "us1_search.json"
$resp2.Content | Out-File -FilePath $out2 -Encoding utf8

# 3) 列出 artifacts 并下载一个样例
$list = Invoke-RestMethod -UseBasicParsing -Uri "http://localhost:4001/api/v1/circuit-agent/artifacts"
$listOut = Join-Path $tmpDir "artifacts_list.json"
$list | ConvertTo-Json -Depth 8 | Out-File -FilePath $listOut -Encoding utf8
if ($list -and $list.items -and $list.items.Count -gt 0) {
  $urlPath = $list.items[0].url
  if ($urlPath -and $urlPath.StartsWith("/")) { $urlPath = "http://localhost:4001$($urlPath)" }
  $sampleOut = Join-Path $tmpDir "artifact_sample.bin"
  Invoke-WebRequest -UseBasicParsing -Uri $urlPath -OutFile $sampleOut
}

Write-Host "[verify-us1] Outputs:" -ForegroundColor Green
Write-Host " - $out1" -ForegroundColor Green
Write-Host " - $out2" -ForegroundColor Green
Write-Host " - $listOut" -ForegroundColor Green

