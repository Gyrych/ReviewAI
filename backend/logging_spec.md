# 后端日志与可追溯性规范

目的：确保每次图片解析与结构化输出都可追溯、可复现，便于问题定位与离线分析。

必需记录字段（保存到 `uploads/enriched_<timestamp>.json` 或单独日志条目）：

- `image_id`：图片文件名或唯一 id
- `model_version`：用于推理的模型标识
- `prompt_hash`：本次使用的 prompt 内容的哈希
- `random_seed`：若有随机性，记录随机种子
- `inference_time_ms`：推理耗时
- `raw_ocr`：OCR 原始文本（若启用 OCR）
- `candidates`：BOM/库匹配候选（含分数与来源 URL）
- `combined_json`：模型返回的原始 JSON（未经裁剪）
- `enriched_json`：合并与交叉校验后的结构化结果（保存为最终返回的 enrichedJson）
- `warnings`：检测到的问题或需人工复核的原因列表

保存位置与命名：

- `backend/uploads/enriched_<ISO8601 timestamp>.enriched.json`（包含所有上述字段）

日志级别与敏感数据：

- 日志中不得保存 Authorization、API Key 等敏感头部。
- 对于外部 URL（如 datasheet），只保存主机 origin 与标题，避免保存过长内容。

访问与清理策略：

- 保留策略：至少保留 90 日，或根据项目合规要求调整。
- 提供命令行或 API 接口用于归档/清理旧日志。


