@echo off
REM Start both backend and frontend by running start-all.js
cd /d "%~dp0"
echo Starting backend and frontend (logs will stream to this window)...
node start-all.js
echo Processes exited. Press any key to close.
pause


