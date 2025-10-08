<#
Windows PowerShell 一键安装并启动脚本
用法示例：
  powershell -ExecutionPolicy Bypass -File .\scripts\install-and-start-services.ps1 -ForceInstall

参数：
  -ForceInstall: 强制对所有服务运行依赖安装（等同于环境变量 FORCE_DEP_INSTALL=1）
  -SkipInstall : 跳过自动安装（等同于 SKIP_DEP_INSTALL=1）

注意：脚本不会执行 git 操作。若需以管理员权限运行，请以管理员打开 PowerShell。
#>

param(
  [switch]$ForceInstall,
  [switch]$SkipInstall
)

function Check-CommandExists($cmd) {
  $proc = Start-Process -FilePath $cmd -ArgumentList '--version' -NoNewWindow -PassThru -WindowStyle Hidden -ErrorAction SilentlyContinue
  if ($proc -eq $null) { return $false }
  try {
    $proc | Wait-Process -Timeout 5
    return $true
  } catch { return $false }
}

Write-Host "[install-and-start] checking node/npm..."
if (-not (Check-CommandExists 'node')) { Write-Error "node not found in PATH. Please install Node.js."; exit 1 }
if (-not (Check-CommandExists 'npm')) { Write-Error "npm not found in PATH. Please install npm."; exit 1 }

if ($ForceInstall) { $env:FORCE_DEP_INSTALL = '1' }
if ($SkipInstall) { $env:SKIP_DEP_INSTALL = '1' }

Write-Host "[install-and-start] invoking start-all.js (this will install missing deps automatically)"
node start-all.js


