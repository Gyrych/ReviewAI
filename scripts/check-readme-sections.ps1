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

# 最小等效性检查：标题数量与 API 项数量需一致
$zhPath = Join-Path $ServiceDir "README.zh.md"
$enPath = Join-Path $ServiceDir "README.md"
$zh = Get-Content -Raw -Path $zhPath
$en = Get-Content -Raw -Path $enPath

function Get-Headers($txt){
    return ($txt -split "`n" | Where-Object { $_ -match '^\#+' }) -replace '^\s*#+\s*','' | ForEach-Object { $_.Trim() }
}
function Get-ApiItemCount($txt){
    return (($txt -split "`n") | Where-Object { $_ -match '^\-\s+(GET|POST|PUT|DELETE)\b' }).Count
}

$zhHeaders = Get-Headers $zh
$enHeaders = Get-Headers $en
$zhApi = Get-ApiItemCount $zh
$enApi = Get-ApiItemCount $en

$diff = @()
if($zhHeaders.Count -ne $enHeaders.Count){ $diff += "标题数量不一致：zh=$($zhHeaders.Count), en=$($enHeaders.Count)" }
if($zhApi -ne $enApi){ $diff += "API 条目数不一致：zh=$zhApi, en=$enApi" }

if($diff.Count -gt 0){
    Write-Error ("README 等效性检查失败：`n" + ($diff -join "`n"))
    exit 4
}

Write-Output "README files present, contain required sections, and pass minimal equivalence checks"
exit 0


