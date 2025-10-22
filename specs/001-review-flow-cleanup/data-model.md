# Data Model — Review Flow Cleanup and Pipeline Assurance

## 实体与字段

### ReviewRequest
- files: File[]（name, mime, bytes/base64/dataURL）
- texts: { requirements?: string; specs?: string; dialog?: string }
- history?: Array<{ role: 'user'|'assistant'|'system'; content: string }>
- options?: { progressId?: string; enableSearch?: boolean; searchTopN?: number; language?: 'zh'|'en' }

校验：
- 至少包含 1 个文件（JPEG/PNG/PDF）或已有 `enrichedJson`。
- language ∈ { zh, en }。

### TimelineEntry
- id: string
- step: string（identify/search/query/hit/summary/request/response/...）
- timestamp: number
- origin: 'backend'|'upstream'|'search'
- meta?: Record<string, any>
- artifacts?: { request?: string; response?: string; extra?: string[] }

规则：
- 关键阶段必须记录：identify/search/query/hit/summary/request/response。
- 若 artifacts 存在，路径可通过 `GET /artifacts/:filename` 访问。

### Artifact
- filename: string
- url: string（`/api/v1/circuit-agent/artifacts/:filename`）
- size: number
- mime: string
- createdAt: number

约束：
- 单个文件建议 ≤5MB；超过时应压缩/分片或提供外链。

### SearchSummary
- url: string
- text: string（≤ 1024 词）
- passedQualityCheck: boolean

规则：
- 仅当 `passedQualityCheck=true` 时注入 system 消息。

### Session
- id: string
- createdAt: number
- updatedAt: number
- items: Array<{ markdown: string; enrichedJson?: any; overlay?: string; timeline: TimelineEntry[] }>

## 关系
- ReviewRequest → 产生 TimelineEntry 列表与若干 Artifact。
- SearchSummary → 通过质量校验后以 system 消息注入下游评审。
- Session → 聚合多轮评审的结果，可列表/加载/删除。

## 状态流转
draft → identifying → searching → summarizing → reviewing → aggregated → completed

失败处理（早返回原则）：
- 缺少系统提示词：返回 500 并记录失败；不产生部分输出。
- 搜索/摘要失败：记录 timeline，跳过注入，继续主评审。


