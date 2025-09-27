# schematic-ai-review

电路图片 → 结构化电路 JSON → LLM 生成 Markdown 评审报告，并在前端以 SVG overlay 进行人工复核的人机协同工作流。本项目为本地开发骨架，前后端分离，便于快速集成与二次开发。

## 重要必读（强提醒）

- **首选位置**：将系统提示词放在 `./ReviewAIPrompt/` 子目录：`ReviewAIPrompt/系统提示词.md`（中文）和 `ReviewAIPrompt/SystemPrompt.md`（英文）。
- **兼容回退**：为兼容历史布局，若子目录中找不到对应文件，后端将回退读取仓库根目录下的 `系统提示词.md` / `SystemPrompt.md`。
- 若在两处均未找到目标语言文件，接口返回 404；前端会显示非阻断警示“无系统提示词环境”，但仍允许与模型对话。
- 如需可直接使用的系统提示词内容，可联系作者付费索取：`gyrych@gmail.com`

## 特性

- 将电路图片解析为结构化 JSON，遵循 `backend/schemas/circuit-schema.json`
- 提供 SVG overlay 与映射，前端可高亮组件/引脚/网络便于人工核对
- 结合 LLM 生成 Markdown 评审报告，支持 timeline、requirements/specs、history 与 system prompt 注入
- 对不确定参数进行 Web 搜索丰富化（默认 DuckDuckGo，可选 Bing）
- 支持本地会话保存/加载（包含文件 base64、enrichedJson、overlay），不持久化敏感凭据
- 文件日志便于诊断排错

## 架构

- `frontend/` — Vite + React + TypeScript + Tailwind（开发端口 3000），代理 `/api` 到后端
- `backend/` — Node.js + Express + TypeScript（默认端口 3001），提供评审、系统提示词、会话与日志等接口

## 快速开始

前置条件：Node.js ≥ 18

1）启动后端

```bash
cd backend
npm install
# 默认端口：3001（可用 PORT 覆盖）
npm run dev
```

2）启动前端（新终端）

```bash
cd frontend
npm install
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)（开发环境）。开发服务器将把 `/api` 代理到 [http://localhost:3001](http://localhost:3001)。

Windows 一键：在仓库根目录执行 `start-all.bat`（或 `node start-all.js`）。

## 配置

- 系统提示词：根目录 `系统提示词.md`（必需）。如需现成内容，发邮件至：`gyrych@gmail.com`（付费）
- 上游模型：支持 DeepSeek、OpenRouter 或自定义 API。在前端选择或手动填写 API/模型名，后端会根据 `provider` 路由到文本/多模态解析。
- 可选环境变量（后端）：
  - `LLM_TIMEOUT_MS`、`VISION_TIMEOUT_MS`、`DEEPSEEK_TIMEOUT_MS`
  - `CONSOLIDATION_TIMEOUT_MS`：整合多轮识别结果的超时时间，单位为毫秒，默认 1800000（30 分钟）。在资源受限或高并发环境请谨慎增大。
  - `ENABLE_PARAM_ENRICH`：是否对每个组件参数逐项进行网络补充（默认 false）。推荐仅在必要时开启；一般场景可关闭以节省网络和降低噪声。
  - `FETCH_RETRIES`、`KEEP_ALIVE_MSECS`
  - `SEARCH_PROVIDER`（`duckduckgo` | `bing`）、`BING_API_KEY`（启用 Bing 时）
  - `OPENROUTER_HTTP_REFERER`、`OPENROUTER_X_TITLE`（用于 OpenRouter）

## API 概要

- `GET /api/system-prompt?lang=zh|en`：返回根目录对应语言的系统提示词文件内容；若该语言文件缺失则 404。
- `POST /api/review`：支持图片（multipart）或 `enrichedJson`；字段包括 `model`、`apiUrl`、可选 `systemPrompts`（JSON：`{ systemPrompt, requirements, specs }`）与 `history`。响应包含 `{ markdown, enrichedJson, overlay, metadata, timeline }`。若检测到低置信冲突，会返回 422 且仍附带结果以便人工复核。

注意：项目中先前使用的 OCR 功能（基于 tesseract.js）已被移除。视觉处理流程不再执行 OCR 文本提取。如果你的工作流依赖图像内的文字标签（例如元件标注），请在将图片提交到 `/api/review` 之前，先使用外部 OCR 服务预处理图片，或者与我沟通以重新集成 OCR 功能。
- 会话：`POST /api/sessions/save`、`GET /api/sessions/list`、`GET /api/sessions/:id`、`DELETE /api/sessions/:id`
- 日志（本地调试）：`GET /api/logs`
- DeepSeek 测试：`POST /api/deepseek`

## 故障排查

- 缺少系统提示词：请在根目录创建 `系统提示词.md`（或邮件 `gyrych@gmail.com` 付费获取）。否则 `/api/system-prompt` 为 404。
- 上游返回 HTML/404：检查 API 路径与模型名（如 OpenRouter `.../api/v1/chat/completions`）；后端会给出更友好的错误信息。
- 端口冲突：前端 3000，后端 3001。若修改端口，请同步调整 `frontend/vite.config.ts` 中的代理目标。
- 评审返回 422：表示低置信或冲突，需要人工复核；请结合 overlay 与 JSON 进行确认后再次提交。

## 安全与隐私

- 会话保存会显式剔除敏感授权字段，日志不记录机密信息。本项目主要用于本地开发与验证。

## 许可

- 如需对外分发或开源，请补充合适的许可证（LICENSE）。
