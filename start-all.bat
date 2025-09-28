@echo off
REM Start circuit-agent service and frontend by running start-all.js
cd /d "%~dp0"
echo Starting circuit-agent and frontend (logs will stream to this window)...
node start-all.js
echo Processes exited. Press any key to close.
pause


