# Timeline 重构测试与回归检查

创建于：2025-09-27

目标：验证 timeline schema 统一、前后端合并与去重、按需加载 artifact、并且能区分前端/后端/LLM 步骤。

测试步骤：
1. 启动后端服务（本地）并打开前端页面。
2. 使用 UI 提交带图片的请求（选择一个或多个图片），观察左侧步骤历史（timeline）是否显示：
   - 初始本地步骤（preparing, uploading_files）立即显示
   - 后端返回后，timeline 被后端数据覆盖，显示诸如 `vision.request`, `vision.response`, `llm.request`, `llm.response`, `analysis.result` 等条目
3. 展开 `llm.request` 或 `llm.response` 条目，确认 artifact 内容在展开时被自动加载并显示原始请求/响应（或点击加载按钮可加载）。
4. 验证每个 timeline 项都带有 `origin` 字段（前端/后端/external），并且 UI 上有对应 badge 或标签显示来源。
5. 验证 timeline 去重：对同一请求多次触发（快速重复点击 submit），界面不应展示重复的 `llm.request/llm.response`（基于 signature/artifact 去重）。
6. 检查下载的 artifact 链接在展开时可打开（如 datasheet PDF 或 final JSON）。
7. 验证保存会话（save session）后，重新加载会话（sessions/list -> sessions/:id）能恢复 timeline，并且仍能按需加载 artifact。

回归检查清单：
- 日志中不应有未捕捉异常或大量重复 timeline push 的警告
- 前端控制台不应有类型错误
- timeline 列表的长度与后端 /api/progress 返回的长度一致（保留本地前置步骤）


