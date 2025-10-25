param(
    [string]$AgentDir = "ReviewAIPrompt\circuit-agent"
)

"Checking prompt files under: $AgentDir"

if(-not (Test-Path $AgentDir)){
    Write-Error "Agent prompt directory not found: $AgentDir"
    exit 2
}

$errors = @()
Get-ChildItem -Path $AgentDir -Recurse -File | ForEach-Object {
    $content = Get-Content -Raw -Path $_.FullName -ErrorAction SilentlyContinue
    if(-not $content -or $content.Trim().Length -eq 0){
        $errors += $_.FullName
    }
}

if($errors.Count -gt 0){
    Write-Error "Found empty or missing prompt files:`n$($errors -join "`n")"
    exit 3
}

Write-Output "All prompt files present and non-empty under $AgentDir"
exit 0


