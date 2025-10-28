Param(
  [string]$RepoRoot = (Get-Location).Path,
  [switch]$DryRun
)

Write-Output "Scanning for structured routes..."
$paths = Get-ChildItem -Path $RepoRoot -Recurse -Include "*structured*.ts","*structured*.js" -File -ErrorAction SilentlyContinue
foreach ($p in $paths) {
  Write-Output ("Found: " + $p.FullName)
  if (-not $DryRun) { Move-Item -Path $p.FullName -Destination ($p.FullName + ".removed") }
}

Write-Output "Done (dryrun=$DryRun)"


