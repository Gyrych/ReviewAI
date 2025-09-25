# Backend（后端）

`schematic-ai-review` 的后端服务（Node.js + Express + TypeScript）。负责接收电路图片、提取结构化 JSON，并组织 LLM 生成 Markdown 评审；同时提供会话保存/加载与日志读取接口。

英文说明见 `backend/README.md`。

## 重要必读（强提醒）

- **首选位置**：将系统提示词放在 `./ReviewAIPrompt/` 子目录：`ReviewAIPrompt/系统提示词.md`（中文）和 `ReviewAIPrompt/SystemPrompt.md`（英文）。
- **兼容回退**：若子目录中找不到对应文件，后端会回退读取仓库根目录下的 `系统提示词.md` / `SystemPrompt.md`。
- 若在两处均未找到目标语言文件，接口仍返回 404；前端会显示非阻断警示“无系统提示词环境”，但仍允许与模型对话。
- 前端会在缺失时显示“无系统提示词环境”的非阻断警示，但仍允许与大模型正常对话。
- 若需要现成的系统提示词内容，可联系作者付费索取：gyrych@gmail.com

## 本地运行

前置条件：Node.js ≥ 18

```bash
cd backend
npm install
# 默认端口：3001（可用 PORT 覆盖）
npm run dev
```

默认地址：`http://localhost:3001`

## 接口概览

- `GET /api/health` — 健康检查
- `GET /api/hello` — 示例端点
- `GET /api/system-prompt?lang=zh|en` — 读取根目录对应语言的系统提示词（缺失则 404）
- `POST /api/review` — 主流程：图片 → JSON → Markdown
- `POST /api/sessions/save` — 保存会话快照（不含敏感字段）
- `GET /api/sessions/list` — 列出最近会话
- `GET /api/sessions/:id` — 读取会话
- `DELETE /api/sessions/:id` — 删除会话
- `POST /api/deepseek` — DeepSeek 文本对话透传测试
- `GET /api/logs` — 读取最近日志（本地调试）

## POST /api/review（详细）

请求体（发送图片时建议使用 multipart；否则常规表单或 JSON 亦可）：

- `apiUrl`（必填）：上游模型 API 端点或基地址
- `model`（必填）：上游模型名称
- `files`（可选）：一张或多张 `image/*` 图片；若不提供，请传 `enrichedJson`
- `enrichedJson`（可选）：先前已提取的电路 JSON，用于跳过图片解析
- `systemPrompts`（可选，字符串化 JSON）：`{ systemPrompt, requirements, specs }`
- `requirements` / `specs`（可选）：附加设计需求与规范
- `history`（可选，字符串化 JSON 数组）：历史对话
- `enableSearch`（可选，默认 true）：是否启用 Web 搜索丰富化
- `searchTopN`（可选）：每个不确定参数的候选数量
- `saveEnriched`（可选，默认 true）：是否将 enriched JSON 保存到 `uploads/`

Provider 路由：

- 若 `provider=deepseek` 或 `apiUrl`/`model` 包含 `deepseek`，将透传文本对话（不支持图片）。
- 否则后端执行视觉解析（OpenRouter 兼容的 JSON 多模态或 multipart）后，再调用 LLM 生成 Markdown 评审。

响应（JSON）：

- `markdown`（string）：评审报告（Markdown）
- `enrichedJson`（object）：结构化电路 JSON
- `overlay`（object，可选）：`{ svg, mapping }`，用于前端高亮
- `metadata`（object，可选）：`{ model_version, inference_time_ms, warnings, ... }`
- `timeline`（array）：`{ step, ts }[]`，用于前端进度与耗时展示

低置信策略：

- 若检测到网络低置信，返回 HTTP 422，但仍包含完整 JSON/overlay 以供人工复核；前端应提示用户核对。

## 目录说明

- `backend/uploads/` — enriched JSON 及相关产物（可选保存）
- `backend/sessions/` — 会话快照（JSON 文件）
- `backend/logs/` — 文件日志（见 `app.log`）
- `backend/schemas/` — 电路提取的 JSON Schema

## 可选环境变量

- `PORT`（默认 3001）
- `LLM_TIMEOUT_MS`、`VISION_TIMEOUT_MS`、`DEEPSEEK_TIMEOUT_MS`（默认 1800000）
- `FETCH_RETRIES`（默认 1）、`KEEP_ALIVE_MSECS`（默认 60000）
- `SEARCH_PROVIDER`（`duckduckgo` | `bing`）、`SEARCH_TOPN`、`BING_API_KEY`
- `OPENROUTER_HTTP_REFERER`、`OPENROUTER_X_TITLE`（用于 OpenRouter）

## 安全与隐私

- 会话保存会显式剔除敏感字段（如 API Key、Authorization）
- 日志避免记录敏感头部
- 响应后会尽量清理上传的临时文件

## 说明

- 见 `docs/circuit_schema.md` 与 `docs/overlay_spec.md` 了解格式细节。
- 可使用 `backend/test/validate_parser_test.js` 对示例数据做轻量校验。


