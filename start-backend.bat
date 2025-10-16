@echo off
setlocal

rem 配置
set PORT=4001
set SERVICE_DIR=%~dp0services\circuit-agent-py
set LOG_FILE=%SERVICE_DIR%\backend.log
set PID_FILE=%SERVICE_DIR%\backend.pid

echo Stopping any process listening on port %PORT%...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT%" ^| findstr LISTENING') do (
  echo Killing PID %%a
  taskkill /PID %%a /F >nul 2>&1
)

echo Activating virtualenv if present...
if exist "%SERVICE_DIR%\venv\Scripts\activate.bat" (
  call "%SERVICE_DIR%\venv\Scripts\activate.bat"
) else (
  echo No virtualenv found, using system python
)

echo Installing requirements (non-interactive)...
py -3 -m pip install -r "%SERVICE_DIR%\requirements.txt" --disable-pip-version-check >nul 2>&1

echo Starting circuit-agent-py service...
rem Start uvicorn in background and redirect stdout/stderr to log
start "circuit-agent-py" /B cmd /c "cd /d "%SERVICE_DIR%" && py -3 -m uvicorn app.main:app --host 0.0.0.0 --port %PORT% > "%LOG_FILE%" 2>&1"

timeout /t 1 >nul
rem capture PID of process listening on port (best-effort)
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":%PORT%" ^| findstr LISTENING') do set NEWPID=%%p
echo %NEWPID% > "%PID_FILE%"
echo Started PID %NEWPID%, logging to %LOG_FILE%

endlocal
