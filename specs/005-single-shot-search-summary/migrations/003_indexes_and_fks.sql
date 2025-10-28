-- 为 Citation 与 AnnotatedMessage 添加索引与外键（兼容 SQLite/Postgres）

-- SQLite: 外键需在连接时启用 PRAGMA foreign_keys = ON;

ALTER TABLE citation ADD COLUMN annotated_message_id TEXT;
CREATE INDEX IF NOT EXISTS idx_citation_annotated_message_id ON citation(annotated_message_id);
CREATE INDEX IF NOT EXISTS idx_citation_url ON citation(url);
CREATE INDEX IF NOT EXISTS idx_citation_domain ON citation(domain);

ALTER TABLE annotated_message ADD COLUMN round_id TEXT;
CREATE INDEX IF NOT EXISTS idx_annotated_message_request_id ON annotated_message(request_id);

-- 若使用 Postgres，可在迁移工具中进一步添加外键约束：
-- ALTER TABLE citation ADD CONSTRAINT fk_ann_msg FOREIGN KEY (annotated_message_id) REFERENCES annotated_message(id) ON DELETE SET NULL;


