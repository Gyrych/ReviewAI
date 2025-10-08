# circuit-fine-agent

轻量说明：这是 `circuit-agent` 的独立副本骨架，供精细评审 Agent 使用。此目录为骨架占位，不会自动启用服务。请参考 `services/circuit-agent/README.md` 完成具体实现与配置。

目录建议：
- src/
  - bootstrap/
  - app/
  - config/
  - infra/
  - interface/
- prompts/  （放置 agent 专属的系统/视觉提示词文件）
- storage/  （独立的 artifacts/sessions 存储）

当前已完成：
- 基础 bootstrap 服务器 `src/bootstrap/server.ts`（基于 `circuit-agent` 复制并调整为独立 basePath）
- 基本 config `src/config/config.ts`（basePath、storageRoot 已隔离）
- 部分 infra/app 文件占位或复制（包括 Artifact/Session 存储、ProgressMemoryStore、AnonymizationService 等）

后续工作（建议）：
1. 复制完整 `services/circuit-agent/src/app`、`infra` 与 `interface` 目录下的实现到本服务，确保所有引用路径正确并在 `package.json` 中声明依赖（当前部分文件复用了相对路径引用）。
2. 填充 `prompts/` 下的系统与视觉提示词（示例文件已在 `ReviewAIPrompt/` 中，可拷贝或定制）。
3. 运行 `npm install` 并通过 `npm run dev` 启动服务（默认端口 4002），并与前端联调。


启动建议：复制 `services/circuit-agent` 的实现并替换 base path 为 `/api/v1/circuit-fine-agent`，确保 prompts 与 storage 路径独立。


