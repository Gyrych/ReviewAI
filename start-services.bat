@echo off
REM ===============================================================
REM Windows 一键启动脚本 - ReviewAI 项目
REM 功能：自动释放端口并分窗口启动三个服务
REM 用法：双击此文件或在 CMD 中运行 start-services.bat
REM ===============================================================

echo ========================================
echo ReviewAI - One-Click Service Launcher
echo ========================================
echo.
echo [1/4] Releasing ports 4001, 4002, 5173...
echo.

REM 释放端口 4001
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\free-port.ps1" -Port 4001

REM 释放端口 4002
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\free-port.ps1" -Port 4002

REM 释放端口 5173 (Vite 默认端口)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\free-port.ps1" -Port 5173

echo.
echo [2/4] Starting circuit-agent on port 4001...
start "circuit-agent (4001)" cmd /k "cd /d "%~dp0services\circuit-agent" && npm run dev"

timeout /t 2 /nobreak >nul

echo [3/4] Starting circuit-fine-agent on port 4002...
start "circuit-fine-agent (4002)" cmd /k "cd /d "%~dp0services\circuit-fine-agent" && npm run dev"

timeout /t 2 /nobreak >nul

echo [4/4] Starting frontend on port 5173...
start "frontend (5173)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ========================================
echo All services launched successfully!
echo ========================================
echo.
echo Three CMD windows have been opened:
echo   - circuit-agent (port 4001)
echo   - circuit-fine-agent (port 4002)
echo   - frontend (port 5173)
echo.
echo Frontend URL: http://127.0.0.1:5173
echo.
echo Press any key to close this launcher window...
pause >nul
