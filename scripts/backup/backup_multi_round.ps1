Param(
  [string]$OutDir = "specs/005-single-shot-search-summary/backups"
)

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

$ts = (Get-Date).ToString("yyyyMMdd_HHmmss")
$filename = "backup_$ts.tar.gz"
$full = Join-Path $OutDir $filename

Write-Output "Creating backup $full"

# 使用 tar 命令（Windows 10+ 包含 tar），在 Linux/macOS 上也可用
try {
  $root = (Get-Location).Path
  & tar -czf $full -C $root ReviewAIPrompt specs services frontend || throw "tar failed"
  Write-Output "Backup created: $full"
  return @{ success = $true; path = $full }
} catch {
  Write-Error "Backup failed: $_"
  exit 1
}


