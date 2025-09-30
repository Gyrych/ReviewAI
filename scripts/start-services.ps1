# 中文注释：一键启动脚本 - 先释放端口，再分窗口启动三个服务（前端、circuit-agent、circuit-fine-agent）
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-services.ps1

Write-Host "[start-services] Step 1: Releasing ports 4001, 4002, 5173..."

& powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\free-port.ps1" -Port 4001
& powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\free-port.ps1" -Port 4002
& powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\free-port.ps1" -Port 5173

Write-Host "[start-services] Step 2: Starting circuit-agent (4001)..."
Start-Process -FilePath "powershell" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd '$PSScriptRoot\..\services\circuit-agent'; npm run dev"

Start-Sleep -Seconds 2

Write-Host "[start-services] Step 3: Starting circuit-fine-agent (4002)..."
Start-Process -FilePath "powershell" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd '$PSScriptRoot\..\services\circuit-fine-agent'; npm run dev"

Start-Sleep -Seconds 2

Write-Host "[start-services] Step 4: Starting frontend (5173)..."
Start-Process -FilePath "powershell" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd '$PSScriptRoot\..\frontend'; npm run dev"

Write-Host "[start-services] Done. Services starting in separate windows."
Write-Host "[start-services] Frontend will be available at http://127.0.0.1:5173"
Write-Host "[start-services] Press any key to exit this launcher..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
