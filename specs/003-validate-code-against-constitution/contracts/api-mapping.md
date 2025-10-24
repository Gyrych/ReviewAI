# API 映射表：前端调用 → 后端公开路由（`services/circuit-agent`）

说明：本文件用于将前端在 `frontend/src` 中的主要 HTTP 调用映射到 `services/circuit-agent` 的公开路由，便于契约校验与自动化验证（参见 tasks T004 / T016）。

- **健康检查**
  - 前端调用示例：`GET /api/v1/circuit-agent/health`
  - 后端实现：`services/circuit-agent/src/interface/http/routes/health.ts`

- **系统提示词（供前端或运维查看）**
  - 前端调用示例：`GET /api/v1/circuit-agent/system-prompt?lang=zh|en`
  - 后端实现：`services/circuit-agent/src/bootstrap/server.ts` 中的 `app.get(`${BASE_PATH}/system-prompt`, ...)` 路由

- **统一编排入口（主要评审接口）**
  - 前端调用示例：`POST /api/v1/circuit-agent/orchestrate/review` （multipart 或 JSON，根据 UI 提交）
  - 后端实现：`services/circuit-agent/src/interface/http/routes/orchestrate.ts` → `makeOrchestrateRouter()`（在 `bootstrap/server.ts` 中挂载）
  - 描述：入口会根据 `directReview` 参数走 direct 路径（建议前端始终以 `directReview=true` 使用）

- **直接评审（multipart 上传）**
  - 前端调用示例：`POST /api/v1/circuit-agent/modes/direct/review`（multipart/form-data）
  - 后端实现：`services/circuit-agent/src/interface/http/routes/directReview.ts`（在 `bootstrap` 中由 `makeDirectReviewRouter` 挂载）

- **进度查询**
  - 前端调用示例：`GET /api/v1/circuit-agent/progress/:id`
  - 后端实现：`services/circuit-agent/src/interface/http/routes/progress.ts`

- **会话管理**
  - 列表：`GET /api/v1/circuit-agent/sessions/list`
  - 保存：`POST /api/v1/circuit-agent/sessions/save`
  - 读取：`GET /api/v1/circuit-agent/sessions/:id`
  - 删除：`DELETE /api/v1/circuit-agent/sessions/:id`
  - 后端实现：`services/circuit-agent/src/interface/http/routes/sessions.ts`

- **Artifacts 列表与静态访问**
  - 列表：`GET /api/v1/circuit-agent/artifacts`
  - 单文件访问：`GET /api/v1/circuit-agent/artifacts/:filename`（静态文件挂载）
  - 后端实现：`services/circuit-agent/src/bootstrap/server.ts`（静态挂载与列出实现）

注意事项：
- 前端在开发模式下（`App.tsx` 中 `isDev`）会使用 `http://localhost:4001` 等绝对地址；在生产或相对部署时使用相对路径 `/api/v1/circuit-agent`。
- 若前端新增对后端路由的调用，应在本文件中追加映射行并更新 `specs/003-validate-code-against-constitution/contracts/openapi.yaml`（如需要）。


