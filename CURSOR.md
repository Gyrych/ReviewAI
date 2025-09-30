# CURSOR.md — 仓库记忆与快速参考（中文）

创建者: GPT-5 Mini（为用户生成）
创建日期: 2025-09-29

本文件为本仓库的快速参考与记忆文档（供 AI 助手与开发者查阅）。
请在对仓库结构、运行方式或关键文件做出修改后同步更新本文件。

## 仓库概览

本仓库 “schematic-ai-review” 用于对电路原理图进行基于视觉与 LLM 的自动化审查，主要组件：

- `frontend/`：Vite + React + TypeScript 前端，负责文件上传、展示 Markdown 审查结果与 SVG 覆盖层（开发服务器：`http://localhost:3000`）。
- `services/circuit-agent/`：独立的后端子服务，提供图像到结构化电路 JSON 的识别、分步审查与最终聚合（默认端口 `4001`，API 基路径 `/api/v1/circuit-agent`）。
- `ReviewAIPrompt/`：必须提供的系统与分 pass 视觉提示词文件集合（运行时必须存在且非空）。

## 快速启动（本地开发）

前提：Node.js >= 18

1. 启动子服务（Circuit Agent 与 Circuit Fine Agent）

```bash
cd services/circuit-agent
npm install
npm run dev

cd ../circuit-fine-agent
npm install
npm run dev
```

默认端口:
- `circuit-agent`: `4001`
- `circuit-fine-agent`: `4002`

2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

默认端口（开发配置）: `3002`（若被占用，Vite 会尝试其它端口）

3. Windows 一键启动

在仓库根目录运行 `start-all.bat`（或 `node start-all.js`）。
注意：`start-all.js` 已实现依赖检查；如子服务目录缺少 `node_modules`，会自动运行 `npm install` 后再启动服务。

## 必需提示词（位置与文件）

后端与前端在运行时期望 `ReviewAIPrompt/` 下包含一组提示词文件以供版本控制与人工审阅。以下文件应存在且非空：

- `ReviewAIPrompt/系统提示词.md`（中文，系统级）
- `ReviewAIPrompt/SystemPrompt.md`（英文，系统级）
- `ReviewAIPrompt/single_pass_vision_prompt.md`（通用单轮视觉提示）
- `ReviewAIPrompt/macro_prompt.md`（宏观 pass）
- `ReviewAIPrompt/ic_prompt.md`（IC 专用 pass）
- `ReviewAIPrompt/rc_prompt.md`（电阻/电容 pass）
- `ReviewAIPrompt/net_prompt.md`（网表追踪 pass）
- `ReviewAIPrompt/verify_prompt.md`（校验 pass）
- `ReviewAIPrompt/consolidation_prompt.md`（汇总/合并用）

当前实现情况与注意事项：

- 实际代码库中 **部分 Provider 仍使用内联 system prompt 字符串**（见 `services/circuit-agent/src/infra/providers/OpenRouterVisionProvider.ts` 与 `OpenRouterVisionChat.ts`）。
- 虽然 `ReviewAIPrompt/` 中存在 canonical prompt 文件（例如 `single_pass_vision_prompt.md`），但当前运行时并不会自动将这些文件同步加载到所有 provider。换言之，仓库包含的 prompt 文本和 provider 内联提示可能不同步。
- 建议将 prompt 外置并实现 `PromptRepository`（例如 `PromptRepositoryFs`），在运行时由 provider 从 `ReviewAIPrompt/` 加载对应 prompt，从而避免版本漂移并支持 prompt 版本化与缓存。

注意：若系统提示词在 `ReviewAIPrompt/` 与仓库根目录都缺失，后端会抛出错误并 fail-fast。前端在缺失系统提示词时会显示非阻断警告，但专用视觉提示若缺失仍可能导致识别流程异常。

## 关键端口与脚本

- 前端开发服务器: `http://localhost:3000`
- 子服务默认端口: `http://localhost:4001`（可由 `PORT` 环境变量覆盖）
- 根脚本: `start-all.bat` / `start-all.js`

## 关键目录与文件索引（简要）

- `frontend/` — 前端源码、构建与静态资源（Vite）。
- `services/circuit-agent/` — 后端子服务（src/ 包含分层架构：domain、app、infra、interface、bootstrap）。
- `ReviewAIPrompt/` — 运行时必须的提示词集合（见上文）。
- `docs/` — 项目相关说明与设计文档（analysis.md、circuit_schema.md 等）。
- `logo/` — 项目徽标与图像资源。

## 运行与调试注意事项

- 启动顺序：通常先启动 `services/circuit-agent`，再启动前端以确保 API 可用。
- 端口冲突：若 `3000`/`4001` 被占用，请修改对应服务的端口并相应更新 `frontend/vite.config.ts` 中的代理目标或传入 `PORT` 环境变量。前端代理默认把 `/api` 转发到后端。
- 提示词缺失：专用视觉提示缺失会导致后端报错并中止请求，请确保 `ReviewAIPrompt/` 下文件存在且非空。
- 日志与工件：后端会在 `services/circuit-agent/storage/artifacts/` 保存生成的 artifact（例如 `*_direct_review_report_*.md`），用于调试与回溯。

- 端口冲突与重复启动提示：若在使用 `start-all.bat` 或 `start-all.js` 启动时遇到 `EADDRINUSE`（端口被占用），通常是先前的服务实例仍在运行。解决方法：
  - 关闭之前打开的启动窗口或终止占用端口的进程（示例：在 PowerShell 中使用 `Get-NetTCPConnection -LocalPort 4001,4002` 查找 `OwningProcess`，再 `Stop-Process -Id <PID>` 停止），或重新启动机器；
  - 或通过任务管理器/资源管理器查找并结束对应 `node.exe` 进程。为方便操作，仓库新增了 `scripts/install-redis-client.ps1`、`scripts/run-redis-docker.ps1`、`scripts/set-redis-env.ps1`，并可扩展添加用于释放端口的辅助脚本。
  - 新增脚本：`scripts/restart-services.ps1` 可自动释放 `3002/4001/4002` 端口并重新启动三个服务（前端 + 两后端）。

### CORS（跨域）

- 为支持前端 DEV 环境直接调用后端（`http://localhost:3002` → `http://localhost:4001/4002`），两个子服务已启用严格白名单 CORS：
  - 允许来源：`http://localhost:3002`、`http://127.0.0.1:3002`
  - 允许方法：GET/POST/DELETE/OPTIONS
  - 允许请求头：Authorization、Content-Type
  - 预检缓存：`Access-Control-Max-Age: 86400`
  - 统一处理预检：全局 `OPTIONS *`
  - 若部署到其他域名/端口，请扩展白名单或改为从环境变量读取允许来源

## 修改与同步策略

每次对代码、架构或提示词进行修改后，请手动更新本文件以保持一致性。建议在 Pull Request 描述或提交信息中注明对 `CURSOR.md` 的同步更新。

## 联系方式与参考

项目作者联系（如需示例提示词等）：`gyrych@gmail.com`

## 变更记录

- 2025-09-29: 初始创建，由 AI 助手生成（GPT-5 Mini）。
- 2025-09-29: 撰写多 Agent PRD 与 API 规范草案（`doc/prd/multi-agent-prd.md`, `doc/prd/agent-api-specs.md`）。
- 2025-09-29: 前端实现与拆分：新增 `frontend/src/types/agent.ts`、在 `App.tsx` 静态注册 `circuit` / `circuit-fine`、按 agent 隔离 App 状态、`ReviewForm` 支持 `agentBaseUrl` 与 `initialMode` 并新增两个 agent 入口文件。
- 2025-09-29: 后端：新增 `services/circuit-fine-agent` 服务骨架并迁移/复制核心实现（domain、usecases、infra、routes、storage），生成 `services/circuit-fine-agent/openapi.yaml` 草案，确保 prompts/storage/artifacts 命名空间隔离。
- 2025-09-29: 文档更新：在 `doc/prd/agent-api-specs.md` 与 `CURSOR.md` 中记录多 Agent 的实现细节与本地验证建议。
- 2025-09-29: 前端修改：精简 tabs 为“电路图单agent评审”和“电路图多agent评审”，将 App 级模型设置移至标题栏并移除页面中显示的模型 API 地址；ReviewForm 根据 `initialMode` 条件隐藏/显示高级配置；会话加载/保存 UI 从全局区移至 Agent 层（wrapper 组件）。
- 2025-09-29: 修复并改进启动脚本：`start-all.js` 增加缺失依赖检测并在必要时自动运行 `npm install`，并支持同时启动 `circuit-agent`、`circuit-fine-agent` 与 `frontend`；同步更新 `start-all.bat` 提示文本。
- 2025-09-29: 修复后端构建冲突：移除 `services/circuit-fine-agent` 中对 `DirectReviewUseCase` 与 `makeOrchestrateRouter` 的重复 re-export，避免 esbuild 报 "Multiple exports with the same name" 错误。
- 2025-09-29: 修复 `services/circuit-fine-agent/src/interface/http/routes/directReview.ts` 中的相对导入路径错误（回退层级少一层），已将导入路径修正为指向兄弟包 `services/circuit-agent/src/interface/http/routes/directReview`。
- 2025-09-29: 修复其他 route 文件中的相对导入（`structuredReview.ts`、`sessions.ts`、`structuredRecognize.ts`、`aggregate.ts`），统一指向 `services/circuit-agent/src/interface/http/routes/*`。
- 2025-09-29: 在 `scripts/` 添加三个 PowerShell 脚本用于在 Windows 上安装 redis 客户端、通过 Docker 启动 Redis 容器并设置 `REDIS_URL` 环境变量；并在本地成功运行脚本、拉取并启动 `redis:7` 镜像，验证返回 `PONG`。
- 2025-09-29: 验证服务健康端点：`circuit-agent` 与 `circuit-fine-agent` 均返回 HTTP 200 且 `status: ok`。
- 2025-09-30: 启用后端 CORS（`services/circuit-agent` 与 `services/circuit-fine-agent`）：严格白名单放行前端开发来源 3002，允许 Authorization/Content-Type，显式处理预检；新增 `scripts/restart-services.ps1` 用于释放端口并重启三个服务（前端 + 两后端）。
- 2025-09-30: 新增自动依赖检测与安装功能：`start-all.js` 在启动前会检查各服务 `node_modules` 依赖，若缺失或设置 `FORCE_DEP_INSTALL=1` 则自动运行 `npm ci`（若存在 lockfile）或 `npm install`，失败时支持重试与可选继续策略。新增 Windows PowerShell 脚本 `scripts/install-and-start-services.ps1` 提供一键安装并启动（支持 `-ForceInstall` 与 `-SkipInstall` 参数）。
- 2025-09-30: 前端视觉微调：新增磨玻璃（glassmorphism）样式类并在关键面板应用，以提升视觉质感（文件：`frontend/src/styles/tailwind.css`, `frontend/src/App.tsx`, `frontend/src/components/ResultView.tsx`, `frontend/src/components/ReviewForm.tsx`）。
- 2025-09-30: 新增多轮对话式单 agent 评审功能改造（由 AI 助手 GPT-5 Mini 实施）：
  - 后端：`DirectReviewUseCase` 支持接收并合并 `history` 字段，将历史轮次转换为 LLM 的 user/assistant messages；注入 `DuckDuckGoHtmlSearch` 作为搜索提供者并在 `enableSearch` 打开时将检索摘要作为 system 消息附加到 LLM 上下文；`orchestrate` 路由保留并转发 `history` 与 `enableSearch` 标志。
  - 前端：`FileUpload` 最大文件数调整为 20；`ReviewForm` 取消单独的问题确认窗格，改为多轮对话式提交流（每次提交将本轮 dialog 与完整 history 一并发送），支持中止（Abort）但保留会话历史，可保存并恢复会话；新增导出按钮可将当前 Markdown 导出为 `.doc` 文件；会话历史条目包含附件元信息以支持恢复与审阅。
  - 文档：新增 PRD `doc/prd/multi-turn-single-agent-prd.md`，并同步要求更新 `README`/`CURSOR.md`。
  - 2025-09-30: E2E 测试与修复记录（由自动化 Chrome DevTools 执行）:
    - 执行步骤：通过前端 `ReviewForm` 上传本地图片 `C:\Users\MACCURA\OneDrive\Desktop\实例电路.png`，填写对话“帮我评审这个电路”，选择模型并提交 `POST /orchestrate/review`；捕获并验证后端 `progress` 与 artifact 输出。
    - 结果：`POST /orchestrate/review` 返回 200；后端在 `services/circuit-agent/services/circuit-agent/storage/artifacts/` 生成 Markdown 报告（最新：`2025-09-30T04-36-56.288Z_direct_review_report_92a8.md`）。
    - 小修复：对 `services/circuit-agent/src/infra/http/OpenRouterClient.ts` 作了 keep-alive / 超时相关的小优化以改进上游请求稳定性（最小改动，未改业务逻辑）。
    - 开发环境注意：在 Windows 环境下运行 `npm run dev` 时若报 `tsx` 未找到，请在服务目录运行 `npm install` 或 `npm install -D tsx`。
