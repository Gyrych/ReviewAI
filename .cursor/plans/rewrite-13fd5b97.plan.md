<!-- 13fd5b97-e5b5-4bae-bc19-0a1b8731078c 1a671c3d-937b-4aff-802d-6ec71af8dfff -->
# 为 services/circuit-agent 撰写/重写 README 的实施计划

概述：我将对 `services/circuit-agent` 目录做逐文件、逐行的代码审查，抽取架构、接口与实现细节，然后基于分析结果生成两份同步的 README 文件：`README.zh.md`（中文）与 `README.md`（英文）。文档会在 Markdown 中内嵌 Mermaid 图（架构图与关键流程图），并包含详细的 API 接口说明、使用规范与最佳实践。

实施步骤（高层）：

1. 逐文件、逐行阅读并记录实现要点（只读阶段）

- 目标文件（将按此清单优先读取）：
- `services/circuit-agent/src/bootstrap/server.ts`
- `services/circuit-agent/src/interface/http/routes/orchestrate.ts`
- `services/circuit-agent/src/interface/http/routes/*.ts`
- `services/circuit-agent/src/app/usecases/DirectReviewUseCase.ts`
- `services/circuit-agent/src/app/usecases/IdentifyKeyFactsUseCase.ts`
- `services/circuit-agent/src/infra/prompts/PromptLoader.ts`
- `services/circuit-agent/src/infra/http/OpenRouterClient.ts`
- `services/circuit-agent/src/infra/search/OpenRouterSearch.ts`
- `services/circuit-agent/src/infra/storage/ArtifactStoreFs.ts`
- `services/circuit-agent/package.json`（运行脚本、依赖）
- `services/circuit-agent/src/domain/contracts/index.ts`
- `services/circuit-agent/src/*` 下其他导出/入口文件（如 `index.ts`、`server.ts`）
- 产出：每个文件的职责、关键函数/类、API 路由与请求/响应结构、依赖关系、异常/错误处理点、配置来源（ENV）。

2. 汇总架构与流程

- 基于第一步输出绘制 Mermaid 架构图（服务边界、外部依赖：OpenRouter、存储、前端）
- 绘制关键流程图（如：Orchestrate 直评流程 -> 识别轮 -> 检索 -> 摘要注入 -> 直评 -> 产出 artifact）

3. 撰写 README（双语）草稿

- 文件路径：
- `services/circuit-agent/README.zh.md`
- `services/circuit-agent/README.md`
- 必包含章节：
- 项目概述（简介与主要功能）
- 快速开始（依赖与运行命令）
- 运行时配置（环境变量清单与含义）
- 架构概览（Mermaid 图 + 简短说明）
- 核心模块说明（按目录或职责划分）
- API 详解（每个路由：方法、路径、请求参数、示例请求体、示例响应、错误码）
- 使用规范与最佳实践（提示词管理、隐私/工件处理、日志注意事项、搜索/enableSearch 使用说明）
- 开发者注意事项（如何调试、常见故障与排查）
- 变更记录/与 `CURSOR.md` 的同步说明（按用户规则需保持同步）

4. 内嵌 Mermaid 图

- 架构图（组件与交互）使用 Mermaid flowchart 或 graph
- Orchestrate 直评主流程使用 Mermaid flowchart 或 sequence
- 确保图注与文本一致，便于 GitHub/Markdown 渲染预览

5. 校对与交付计划草稿

- 在生成 README 草稿后，我会把草稿（中文与英文）展示给您，逐条说明关键实现说明与任何假设点，等待您确认。
- 如果需要，我会根据您的反馈修改并在确认后将 `CURSOR.md` 与 README 同步更新（但在未获您确认前我不会对仓库做任何写入）。

产出物（最终）：

- `services/circuit-agent/README.zh.md`（中文完整 README，含 Mermaid 图）
- `services/circuit-agent/README.md`（英文完整 README，含 Mermaid 图）
- 一份按文件整理的分析摘要（供您审阅），包含关键代码位置引用与接口样例。

风险与注意事项：

- 若 `ReviewAIPrompt/` 下缺失某些提示词文件，我将在分析中标注并在 README 的“运行注意”中提醒（CURSOR.md 也应同步）。
- 我不会在未经您允许的情况下修改任何代码或提交文件。所有写入操作将在您批准计划并允许我实施后进行。

下一步：

- 如果您批准此计划（直接回复“批准”或“通过”），我将开始逐文件只读审查并把分析摘要与 README 草稿发给您。

### To-dos

- [ ] 逐文件逐行分析 `services/circuit-agent` 目录并形成分析摘要
- [ ] 基于分析撰写 `README.zh.md` 草稿（含 Mermaid 架构图/流程图）
- [ ] 基于分析撰写 `README.md` 草稿（英文，含 Mermaid 图）
- [ ] 准备在用户确认后将 README 与 `CURSOR.md` 同步说明改动（仅草案）