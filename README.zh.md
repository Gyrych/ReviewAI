# schematic-ai-review

本项目提供一个本地可运行的前后端分离示例骨架，用于演示与快速开发。前端使用 Vite + React + TypeScript，后端使用 Node.js + Express（TypeScript）。

## 目录结构

- `frontend/` — 前端应用（Vite，默认端口 `5173`）
- `backend/` — 后端 API（默认端口 `3001`，可用 `PORT` 环境变量覆盖）

## 安装与运行

启动后端：

```bash
cd backend
npm install
# 默认运行端口 3001；如需更改请设置环境变量：
# Windows（PowerShell）: $env:PORT=3000; npm run dev
# Linux/macOS: PORT=3000 npm run dev
npm run dev
```

在另一个终端启动前端：

```bash
cd frontend
npm install
npm run dev
```

打开 `http://localhost:5173`，前端会尝试请求后端的示例接口（如 `/api/hello` 或 `/api/review`），请确保后端已启动并按需设置端口。

## 快速演示

1. 启动后端：`cd backend && npm install && npm run dev`
2. 启动前端：`cd frontend && npm install && npm run dev`
3. 访问 `http://localhost:5173`，页面会显示后端返回的示例消息。

（在 Windows 下可运行仓库根目录的 `start-all.bat` 进行一键启动）

## 新增项（简要）

- **贡献**：欢迎通过 Issues 或 PR 贡献代码与文档。请在提交前确保代码通过基本本地测试。
- **联系方式**：如需联系维护者，请在仓库 Issue 中留言。
- **许可**：请参见仓库根目录的 `LICENSE`（如无请添加合适的许可证）。

## 其他说明

- 后端示例端点：`GET /api/hello`、`POST /api/review`（接收表单和文件上传）。
- 后端默认端口以代码为准（`backend/src/index.ts` 使用 `process.env.PORT || 3001`）。


