# Backend

这是 `schematic-ai-review` 的后端部分，使用 Node.js + Express（TypeScript）构建。

## 本地运行

```bash
cd backend
npm install
# 默认端口：3001；如需覆盖请设置环境变量 PORT
# Windows（PowerShell）: $env:PORT=3000; npm run dev
# Linux/macOS: PORT=3000 npm run dev
npm run dev
```

默认后端运行在 `http://localhost:3001`，并暴露示例端点 `GET /api/hello` 与 `POST /api/review`。

如果你打算在不同主机或端口运行前端与后端，请相应地调整前端代理或直接使用完整后端地址。


