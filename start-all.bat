@echo off
REM Start circuit-agent service and frontend by running start-all.js
cd /d "%~dp0"
echo Starting circuit-agent, circuit-fine-agent and frontend (logs will stream to this window)...
REM 自动安装依赖并启动（默认启用强制安装以保证首次运行成功）
set FORCE_DEP_INSTALL=1
node start-all.js
echo Processes exited. Press any key to close.
pause


