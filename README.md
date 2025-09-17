# schematic-ai-review

Minimal local development skeleton with separated frontend and backend.

**中文说明**：see `README.zh.md` for a localized Chinese version.

## Structure

- `frontend/` — Vite + React + TypeScript + Tailwind minimal app (port 5173)
- `backend/` — Node.js + Express + TypeScript API (default port 3001)

## Install & Run

Start backend:

```bash
cd backend
npm install
# default runs on port 3001; to override use PORT env var
npm run dev
```

Start frontend (in a separate terminal):

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and you should see the frontend fetching `/api/hello` (the frontend proxies to the same host; ensure backend is running on port 3001).

## 新增功能说明：图片解析与人工复核流程

本项目新增了图片到结构化电路描述（JSON）的工作流，并在前端展示 overlay 以便人工复核。

后端现在会在 `/api/review` 返回以下字段（若解析到）：

- `markdown`：Markdown 格式的评审报告
- `enrichedJson`：符合 `backend/schemas/circuit-schema.json` 的结构化描述
- `overlay`：包含 `svg` 与 `mapping`，用于前端高亮显示
- `metadata`：包含 `model_version`, `inference_time_ms`, `warnings`

前端展示：评审结果区会渲染 overlay（若存在），并在下方显示 `enrichedJson` 以便人工核对与修改。

开发者注意：要实现完整闭环还需：

1. 上游模型保证返回可解析的 JSON（或后端实现解析/映射）
2. 前端可提交人工修正后的 `enrichedJson` 回后端以进行二次验证
3. 建议将 `backend/test/validate_parser_test.js` 集成到 CI 中，并提供真实的 ground-truth 示例用于回归测试

### Demo

1. Start backend: `cd backend && npm install && npm run dev`
2. Start frontend: `cd frontend && npm install && npm run dev`
3. Visit `http://localhost:5173` — the page will display the message returned from the backend.
