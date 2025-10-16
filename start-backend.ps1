param(
    [int]$Port = 4001
)

$ServiceDir = Join-Path $PSScriptRoot 'services\circuit-agent-py'
$EnvFile = Join-Path $ServiceDir '.env'
$LogFile = Join-Path $ServiceDir 'backend.log'
$PidFile = Join-Path $ServiceDir 'backend.pid'

Write-Host "Stopping any process listening on port $Port..."
try {
    $p = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($p) {
        $ownPid = $p.OwningProcess
        Write-Host "Killing PID $ownPid"
        Stop-Process -Id $ownPid -Force -ErrorAction SilentlyContinue
    }
} catch {}

# Activate venv if present
$VenvActivate = Join-Path $ServiceDir 'venv\Scripts\Activate.ps1'
if (Test-Path $VenvActivate) {
    Write-Host "Activating virtualenv..."
    & $VenvActivate
} else {
    Write-Host "No virtualenv found, using system python"
}

# Install dependencies (non-interactive)
Write-Host "Installing requirements..."
py -3 -m pip install -r "$ServiceDir\requirements.txt" --disable-pip-version-check | Out-Null

# Start service
Write-Host "Starting service..."
Start-Process -FilePath "py" -ArgumentList "-3 -m uvicorn app.main:app --host 0.0.0.0 --port $Port" -RedirectStandardOutput $LogFile -RedirectStandardError $LogFile -WindowStyle Hidden
Write-Host "Service started, logging to $LogFile"
