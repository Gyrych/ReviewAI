-- 迁移脚本：创建 Citation 表
-- 说明：此脚本用于 SQLite/Postgres（兼容常见 DDL），保证基本索引用于审计查询

CREATE TABLE IF NOT EXISTS citation (
  id TEXT PRIMARY KEY,
  annotated_message_id TEXT NOT NULL,
  url TEXT NOT NULL,
  domain TEXT,
  title TEXT,
  snippet TEXT,
  start_index INTEGER,
  end_index INTEGER,
  confidence_score REAL,
  raw_html TEXT,
  fetch_timestamp TEXT,
  mime_type TEXT,
  favicon TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_citation_annotated_message_id ON citation(annotated_message_id);
CREATE INDEX IF NOT EXISTS idx_citation_url ON citation(url);
CREATE INDEX IF NOT EXISTS idx_citation_domain ON citation(domain);


