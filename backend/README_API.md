API Contract 说明（扩展）

POST /api/review

请求：与原有保持兼容（表单字段、图片上传等）。

响应（新增）：

- `markdown`：生成的评审报告（字符串）。
- `enrichedJson`：结构化电路描述，遵循 `backend/schemas/circuit-schema.json`。
- `overlay`：{ `svg`: string, `mapping`: object }（SVG 内容或 base64 编码）
- `metadata`：{ `model_version`, `inference_time_ms`, `warnings` }

错误码：
- 400: 参数缺失或格式错误
- 422: 低置信或冲突导致需要人工复核（响应中仍会返回 `enrichedJson` 与 `overlay`，并在 `metadata.warnings` 中列出需确认项）


