Param(
  [string]$BackupFile
)

if (-not $BackupFile) { Write-Error "Please provide BackupFile path"; exit 1 }
if (-not (Test-Path $BackupFile)) { Write-Error "Backup file not found: $BackupFile"; exit 1 }

Write-Output "Rolling back from $BackupFile"

try {
  $root = (Get-Location).Path
  & tar -xzf $BackupFile -C $root || throw "tar extract failed"
  Write-Output "Rollback completed"
} catch {
  Write-Error "Rollback failed: $_"
  exit 1
}


