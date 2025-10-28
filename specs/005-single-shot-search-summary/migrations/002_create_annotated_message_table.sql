-- 迁移脚本：创建 AnnotatedMessage 表
CREATE TABLE IF NOT EXISTS annotated_message (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  request_id TEXT,
  model_response_raw TEXT,
  text_content TEXT,
  citations TEXT, -- 存储为 JSON 数组或逗号分隔
  parsed_metadata TEXT,
  artifact_path TEXT,
  status TEXT,
  reviewer_id TEXT,
  review_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_annotated_message_request_id ON annotated_message(request_id);


