## 电路图评审 Agent（独立后端子服务）

本服务为电路图评审提供严格分层与模块化的后端实现，追求高内聚、低耦合，并可在未来横向扩展更多 Agent 与评审模式。

要点：
- 独立目录：`services/circuit-agent/`
- 支持两种彼此独立的模式（当前范围）：
  1) 直接评审：由用户选择 OpenRouter 视觉模型进行直接评审
  2) 精细评审：固定 5 轮视觉识别（`openai/gpt-5-mini`）+ 可选 datasheet 联网搜索（DuckDuckGo HTML）+ 多文本模型并行评审 + 使用 `openai/gpt-5` 最终整合
- 已移除 deepseek
- 使用 Redis 记录进度；存储路径隔离
- 服务层面不限制附件大小（仍需注意基础设施限制）

### 快速开始

1) 复制 `.env.example` 为 `.env` 并按需修改。
2) 安装依赖并启动：

```
cd services/circuit-agent
npm install
npm run dev
```

3) 健康检查：
```
GET http://localhost:4001/api/v1/circuit-agent/health
```

### 目录结构（严格分层）

```
src/
  domain/          # 领域实体与接口契约（不依赖基础设施）
  app/             # 用例与编排
  interface/http/  # 控制器、DTO、校验
  infra/           # Provider 实现（OpenRouter、搜索、存储等）
  config/          # 统一配置
  bootstrap/       # 启动入口
storage/
  artifacts/
  datasheets/
  sessions/
  tmp/
```

### 安全与隐私
### API（v1）概览

基础路径：`/api/v1/circuit-agent`

- GET `/health` → `{ status, service, version? }`
- GET `/progress/:id` → `{ timeline: TimelineItem[] }`
- 静态 `/artifacts/:filename` → 访问已保存工件

模式端点：
- POST `/modes/direct/review`（multipart）
  - 字段：`apiUrl`, `model`, `systemPrompt`, `requirements?`, `specs?`, `dialog?`, `history?`, `progressId?`, `files[]`
  - 返回：`{ markdown, timeline }`
- POST `/modes/structured/recognize`（multipart）
  - 字段：`apiUrl`, `visionModel=openai/gpt-5-mini`, `enableSearch?`, `searchTopN?`, `progressId?`, `files[]`
  - 返回：`{ circuit, timeline }`
- POST `/modes/structured/review`（json）
  - 请求体：`{ apiUrl, models[], circuit, systemPrompt, requirements?, specs?, dialog?, history?, progressId? }`
  - 返回：`{ reports: [{ model, markdown }], timeline }`
- POST `/modes/structured/aggregate`（multipart）
  - 字段：`apiUrl`, `model=openai/gpt-5`, `systemPrompt`, `circuit(json)`, `reports(json)`, `progressId?`, `files[]`
  - 返回：`{ markdown, timeline }`
- 严禁记录 Authorization 等敏感头与密钥
- 匿名化组件将尽量脱敏 PII 与可识别项（不破坏技术语义）

### 许可
内部使用。


