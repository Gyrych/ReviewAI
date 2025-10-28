Param(
  [string]$TargetPath,
  [switch]$DryRun
)

if (-not $TargetPath) { Write-Error "TargetPath required"; exit 1 }

if ($DryRun) { Write-Output "DryRun: would remove $TargetPath"; exit 0 }

if (Test-Path $TargetPath) {
  $bak = "$TargetPath.rollback"
  Copy-Item -Path $TargetPath -Destination $bak -Recurse -Force
  Remove-Item -Path $TargetPath -Recurse -Force
  Write-Output "Removed $TargetPath (backup: $bak)"
} else { Write-Error "Not found: $TargetPath"; exit 1 }


