# 说明：释放 3002/4001/4002 端口占用并重启本项目服务（前端 + 两个后端）
# 注意：不使用 && 连接命令，避免交互；请以非管理员 PowerShell 运行亦可。

param()

Write-Host "[restart] 查找并释放端口 3002, 4001, 4002 的占用进程..."
$ports = @(3002, 4001, 4002)
foreach ($port in $ports) {
  try {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
      $pids = $conns | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique
      foreach ($pid in $pids) {
        try {
          $p = Get-Process -Id $pid -ErrorAction SilentlyContinue
          if ($p) {
            Write-Host "[restart] 停止进程 PID=$pid ($($p.ProcessName)) 占用端口 $port"
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
          }
        } catch {}
      }
    }
  } catch {}
}

Write-Host "[restart] 启动项目服务 (node start-all.js)..."
$root = (Resolve-Path "$PSScriptRoot\..\").Path
Start-Process -FilePath "node" -ArgumentList "start-all.js" -WorkingDirectory $root

Write-Host "[restart] 已触发启动。请在数秒后通过浏览器访问 http://localhost:3002 进行验证。"



