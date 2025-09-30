param(
    [Parameter(Mandatory = $true)]
    [int]$Port
)

# 中文注释：释放指定端口的占用进程（Windows PowerShell）。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts\free-port.ps1 -Port 4001

Write-Host "[free-port] Releasing port $Port ..."

try {
    $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
} catch {
    $conns = $null
}

if (-not $conns) {
    Write-Host "[free-port] Port $Port is free."
    exit 0
}

$pids = $conns | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique

foreach ($owningPid in $pids) {
    try {
        $proc = Get-Process -Id $owningPid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "[free-port] Killing PID=$owningPid ($($proc.ProcessName)) ..."
            Stop-Process -Id $owningPid -Force -ErrorAction SilentlyContinue
        }
    } catch {}
}

Start-Sleep -Seconds 1

try {
    $conns2 = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($conns2) {
        Write-Host "[free-port] WARNING: Port $Port still in use."
        exit 1
    } else {
        Write-Host "[free-port] Port $Port released."
        exit 0
    }
} catch {
    Write-Host "[free-port] Unable to confirm port state; attempted release."
    exit 0
}


