Param(
  [string]$TargetFile
)

if (-not $TargetFile) { Write-Error "TargetFile required"; exit 1 }
if (-not (Test-Path $TargetFile)) { Write-Error "Target not found: $TargetFile"; exit 1 }

$bak = "$TargetFile.rollback"
Copy-Item -Path $TargetFile -Destination $bak -Force
Write-Output "Backup created: $bak"


