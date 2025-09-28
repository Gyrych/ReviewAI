# Frontend（前端）

`schematic-ai-review` 的前端（Vite + React + TypeScript + Tailwind）。负责与后端交互，展示 Markdown 评审与 SVG overlay，支持会话与进度显示。

英文说明见 `frontend/README.md`。

## 重要必读（强提醒）

- **首选位置**：将系统提示词放在 `./ReviewAIPrompt/` 子目录：`ReviewAIPrompt/系统提示词.md`（中文）和 `ReviewAIPrompt/SystemPrompt.md`（英文）。
- **兼容回退**：若子目录中找不到对应文件，后端会回退读取仓库根目录下的 `系统提示词.md` / `SystemPrompt.md`。
- 若在两处均未找到目标语言文件，接口返回 404，UI 将显示非阻断警示“无系统提示词环境”，但仍允许与大模型正常对话。
- 如需现成的系统提示词内容，可联系作者付费索取：gyrych@gmail.com

## 开发服务器

- 访问地址：`http://localhost:3000`
- 代理：`/api` → `http://localhost:3001`（见 `vite.config.ts`）

如修改端口，请同步更新 `vite.config.ts` 的代理目标。

## 本地运行

```bash
cd frontend
npm install
npm run dev
```

## 界面使用指南

- 全局配置（左侧）：
  - 模型 API：从预置项选择，或切换为“自定义”并输入任意 API（支持 DeepSeek、OpenRouter 等）
  - 模型名称：OpenRouter 提供预置列表；也可输入自定义模型名
  - API Key：此处填写，后端将以 `Authorization: Bearer <key>` 方式向上游透传
  - 会话：加载/删除/刷新最近会话
  - 主题切换：亮/暗
- 选项卡：电路（已实现）、代码/文档/需求（占位）
- 电路页：
  - 文件上传（JPEG/PNG/PDF，支持多文件）
  - 系统提示：设计需求（requirements）与设计规范（specs），前端还会自动注入根目录 `系统提示词.md`
  - 问题确认：只读区，每页展示模型提出的澄清问题
  - 对话：与模型交互的输入区域（按页）
  - 进度与耗时：来自后端 `timeline`
  - 操作：提交、重置、保存会话
- 结果（右侧）：
  - Markdown 评审渲染（含代码高亮）
  - 可选 overlay：内联 SVG 与 mapping 统计
  - 可展开的 `enrichedJson` 便于人工核查

## 数据流简述

1）提交时尝试请求 `GET /api/system-prompt`；若存在，会以 `systemPrompts` 的形式与 requirements/specs 一并传给后端。
2）若上传图片，后端将进行电路 JSON 提取；若已有 `enrichedJson`，可直接复用以避免重复上传。
3）后端调用 LLM 生成 Markdown，并返回 `{ markdown, enrichedJson, overlay, metadata, timeline }`。
4）前端渲染 Markdown 与 overlay，并保留 `enrichedJson` 以支持后续提交。

## 配置

- `VITE_CLIENT_TIMEOUT_MS`（可选）：前端请求后端的超时（默认 1800000 毫秒）。

## 故障排查

- 缺少系统提示词：在根目录创建 `系统提示词.md`，或邮件 `gyrych@gmail.com` 付费获取。
- 评审返回 422：表示低置信或冲突；请结合 overlay 与 JSON 进行人工复核。
- 端口不一致：确保前端 3000、后端 3001；如修改端口，请同步更新代理配置。
- OpenRouter 模型：检查端点路径（如 `/api/v1/chat/completions`）与模型名称。

## 安全

前端不将敏感凭据持久化到磁盘。会话保存到后端时会剔除敏感头部。

## 许可

若需要对外分发，请补充合适的许可证（LICENSE）。


