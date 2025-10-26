# 服务边界审计（circuit-agent）

目的：识别跨服务共享状态/文件/DB 的潜在耦合，并提出契约化替代与迁移建议（覆盖 FR-007）。

## 当前边界与交互
- 前端 ⇄ 后端：HTTP/JSON（multipart 文件上传；JSON 响应）
- 后端 ⇄ 上游（OpenRouter/OpenAI 兼容）：HTTP/JSON（外部服务）
- 持久化：文件系统 `STORAGE_ROOT`（artifacts/sessions），可选 Redis（进度）

## 风险点
- 共享文件：前端通过静态路径 `/artifacts` 读取后端生成的工件（合理：由服务统一暴露，仅静态访客，不跨服务写入）
- 共享状态：Redis 仅由后端写入/读取 `progress`，无跨服务共享写操作（合理）
- 非契约耦合：无直接 DB 共享；跨服务仅 HTTP 契约

## 建议与迁移
- 明确 artifacts 的只读性：保持通过后端静态路由访问，禁止其他服务直接读写后端存储路径
- 若扩展多后端：为 artifact 引入签名与过期策略；或迁移到对象存储（S3/OSS）并通过预签名 URL 暴露
- 统一会话契约：`/sessions/*` 仅由服务提供 CRUD，前端通过 HTTP 访问；避免前端直接存储到磁盘

## 审计结论
- 当前服务边界清晰，无共享 DB/文件的写入耦合；维持 HTTP 契约与只读静态暴露即可。
