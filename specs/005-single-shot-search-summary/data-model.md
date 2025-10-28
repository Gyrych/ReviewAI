## Data Model: AnnotatedMessage 与 Citation

## AnnotatedMessage
- id: string (UUID)
- created_at: datetime
- request_id: string (关联请求/轮次)
- model_response_raw: json (原始模型响应)
- text_content: text (模型返回的综合回答文本)
- citations: Citation[] (外键/引用列表)
- parsed_metadata: json (解析器输出的元数据，如片段位置索引)
- artifact_path: string (保存原始响应的 artifact URL)
- status: enum (processed / needs_review / failed)
- reviewer_id: string|null (人工复核处理人)
- review_notes: text|null

## Citation
- id: string (UUID)
- annotated_message_id: string (外键 -> AnnotatedMessage.id)
- url: string
- domain: string
- title: string|null
- snippet: text|null
- start_index: int|null
- end_index: int|null
- confidence_score: float|null
- raw_html: text|null
- fetch_timestamp: datetime|null
- mime_type: string|null
- favicon: string|null
- created_at: datetime

# Data Model: 单次交互搜索+摘要

## Entities

### AnnotatedMessage

- **描述**: 模型返回的消息主体，包含文本与可选的引用注解数组
- **字段**:
  - `id` (string, UUID)
  - `round_id` (string) — 关联 RoundConfig
  - `text` (string) — 模型返回的纯文本
  - `raw_response_artifact` (string) — 指向 artifact 存储的原始响应路径
  - `citations` (array of Citation ids) — 可选
  - `created_at` (timestamp)

### Citation

- **描述**: 引用实体，代表模型在回答中标注的外部来源
- **字段**:
  - `id` (string, UUID)
  - `annotated_message_id` (string, FK)
  - `url` (string)
  - `title` (string)
  - `snippet` (string, optional)
  - `start_index` (int, optional)
  - `end_index` (int, optional)
  - `domain` (string)
  - `confidence_score` (float, optional)
  - `raw_html` (string, optional)
  - `fetch_timestamp` (timestamp, optional)
  - `mime_type` (string, optional)
  - `favicon` (string, optional)
- `created_at` (timestamp)

### 索引与约束建议

- 对 `annotated_message_id`、`url`、`domain` 建立索引；
- 若使用关系型数据库，建议为 `annotated_message_id` 建立外键约束指向 `AnnotatedMessage.id`；


### RoundConfig

- **描述**: 请求级配置，决定是否启用 Web 搜索、引擎策略、max_results 与上下文规模
- **字段**:
  - `id` (string, UUID)
  - `enable_search` (bool)
  - `engine` (string, enum: auto|native|exa)
  - `max_results` (int)
  - `context_scale` (string, enum: low|medium|high)
  - `timeout_ms` (int)
  - `budget_tokens` (int, optional)

## Validation rules

- `max_results` 必须在 0..10 之间
- `context_scale` 必须是 `low|medium|high`

## Storage decisions

- Citation 与 AnnotatedMessage 存在可索引的轻量数据库表（建议 SQLite/Postgres 视部署环境）
- 原始模型响应保存为 artifact（文件系统），引用字段在 DB 中存储索引以便审计与展示


### Citation 存储与审计补充（建议）

- **必需字段与元数据**:
  - `id` (PK)
  - `annotated_message_id` (FK -> AnnotatedMessage.id)
  - `url` (索引)
  - `domain` (索引)
  - `title`
  - `snippet` (可选，建议长度上限 1024 字符)
  - `start_index`, `end_index`
  - `confidence_score` (小数)
  - `raw_html` (可选，敏感/大内容需脱敏或存储到受控 artifact)
  - `fetch_timestamp` (UTC)
  - `mime_type`
  - `favicon` (可选)
  - `created_by`, `created_at` (审计字段)

- **索引建议**:
  - 对 `annotated_message_id`、`url`、`domain` 建立索引以便快速查询与展示
  - 对 `fetch_timestamp` 建立时间序列索引用于审计与过期清理

- **隐私/脱敏策略**:
  - `raw_html` 若包含敏感信息，先进行脱敏或将其存储为受限 artifact，仅在审计/复核场景下提供访问
  - `snippet` 长度上限建议 1024 字符，超过则截断并记录截断标记

- **保留/清理策略**:
  - 原始抓取数据默认保留 180 天，过期后异步归档或脱敏化存储；关键审计记录（metadata）应长期保留

- **一致性校验**:
  - 在迁移脚本中验证字段与索引是否已创建，并在回放验证中确认查询/恢复能力


