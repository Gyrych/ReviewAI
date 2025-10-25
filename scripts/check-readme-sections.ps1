param(
    [string]$ServiceDir = "services/circuit-agent"
)

$requiredSections = @("API 列表","示例调用","启动/停止","依赖说明","Mermaid")

$errors = @()

foreach($lang in @("README.md","README.zh.md")){
    $path = Join-Path $ServiceDir $lang
    if(-not (Test-Path $path)){
        $errors += "Missing file: $path"
        continue
    }
    $content = Get-Content -Raw -Path $path
    foreach($section in $requiredSections){
        if($content -notmatch [regex]::Escape($section)){
            $errors += "$lang missing section: $section"
        }
    }
}

if($errors.Count -gt 0){
    Write-Error "README checks failed:`n$($errors -join "`n")"
    exit 4
}

Write-Output "README files present and contain required sections"
exit 0


