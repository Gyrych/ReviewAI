# Quickstart: 本地验证 Search+Summary 功能

## 前提

- Node.js >= 18
- 已在仓库根执行 `node start-all.js` 启动后端服务（或单独在 `services/circuit-agent` 启动）

## 本地调用示例

使用 curl 调用本地 API（假设后端路由已注册为 `/api/v1/search-summary`）:

```bash
curl -X POST http://localhost:4001/api/v1/search-summary \
  -H 'Content-Type: application/json' \
  -d '{"query":"测试查询", "roundConfig": {"enable_search": true, "max_results": 3}}'
```

响应示例包含 `text` 与 `citations` 字段；若无引用则 `citations: []` 并附带 `note: "no citations"` 的日志条目。

## 验证点

- 确认后端发起仅一次上游模型请求（请求计数=1）
- 确认响应中包含 `citations` 数组或空数组
- 检查 artifacts/ 目录是否包含 `raw_response_artifact`


