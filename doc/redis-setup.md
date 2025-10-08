# Redis 在本项目中的安装与配置（Windows / Docker / WSL）

本文件说明如何在本地为 `services/circuit-agent` 启用 Redis，以便将进度存储（progress store）从内存回退切换为 Redis 实现。

重要说明：本指南只变更本地开发环境的依赖与环境变量，不会修改生产配置。请根据你的环境选择适合的安装方式。

1) 在 `services/circuit-agent` 安装 Redis 客户端依赖

  - 建议步骤（在 PowerShell 中先保存脚本再执行）：

```powershell
# 保存为 scripts/install-redis-client.ps1
cd services/circuit-agent
npm install redis
```

2) 启动或准备 Redis 服务（任选其一）

- 使用 Docker（推荐，简单且可移除）：

```powershell
# 保存为 scripts/run-redis-docker.ps1
docker run -d --name review-redis -p 6379:6379 redis:7
```

- 使用 WSL / Linux：

  - 在 WSL 中安装 `redis-server` 并启动：`sudo apt update && sudo apt install redis-server -y && sudo service redis-server start`

- 在 Windows 原生上安装（若有合适的分发版）：参照 `https://redis.io` 官方说明或使用 MSOpenTech 构建。

3) 配置环境变量 `REDIS_URL`

  - 临时（当前 PowerShell 会话）：

```powershell
$env:REDIS_URL = 'redis://localhost:6379'
```

  - 永久（系统级，PowerShell）：

```powershell
setx REDIS_URL "redis://localhost:6379"
```

4) 启动 `circuit-agent` 并验证

  - 在 `services/circuit-agent` 目录运行：

```powershell
npm run dev
```

  - 期望日志：

```
[circuit-agent] Progress store: Redis
```

  - 若仍看到 Memory fallback：
    - 检查 `services/circuit-agent/node_modules/redis` 是否存在（若不存在，重新运行 `npm install redis`）。
    - 检查 `REDIS_URL` 是否能连通（可用 `redis-cli -u redis://localhost:6379 ping` 测试，返回 `PONG`）。

5) 常见故障与排查

- 错误：`Error: getaddrinfo ENOTFOUND` 或 连接超时
  - 原因：`REDIS_URL` 配置错误或 Redis 服务未运行。检查端口、主机和防火墙。

- 错误：`Cannot find module 'redis'`
  - 原因：未在 `services/circuit-agent` 安装 `redis` 包。执行 `cd services/circuit-agent && npm install redis`。

6) 清理（如果使用 Docker）

```powershell
docker rm -f review-redis
```

7) 测试建议

- 在启用 Redis 后，触发一个简单的请求到 `circuit-agent` 的健康或进度接口，观察启动日志是否输出 `Progress store: Redis`。

如果你需要我把这些步骤写入具体的 PowerShell 脚本（如 `scripts/install-redis-client.ps1`、`scripts/run-redis-docker.ps1`、`scripts/set-redis-env.ps1`），我可以继续创建这些脚本文件。


