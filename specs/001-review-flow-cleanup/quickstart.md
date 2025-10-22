# Quickstart — Review Flow Cleanup and Pipeline Assurance

## 环境
- Node.js ≥ 18
- 后端：`node start-all.js` 或分别在 `services/*` 与 `frontend` 下安装并启动
- 必需提示词：`ReviewAIPrompt/` 目录下各系统/识别/检索/摘要提示词需存在且非空

## 一键启动（Windows PowerShell）
```powershell
node .\start-all.js
```

或分别启动示例：
```powershell
cd services\circuit-agent
npm install
npm run dev
```

## 调用示例（curl，禁用搜索）
```bash
curl -X POST "http://localhost:4001/api/v1/circuit-agent/orchestrate/review" \
  -F files=@test/实例电路.png \
  -F requirements="请根据规范输出 Markdown 评审" \
  -F specs="PCB 走线与电源去耦规范" \
  -F dialog="首次提交" \
  -F enableSearch=false \
  -F language=zh
```

## 调用示例（curl，启用搜索）
```bash
curl -X POST "http://localhost:4001/api/v1/circuit-agent/orchestrate/review" \
  -F files=@test/实例电路.png \
  -F requirements="请根据规范输出 Markdown 评审" \
  -F specs="PCB 走线与电源去耦规范" \
  -F dialog="启用搜索" \
  -F enableSearch=true \
  -F language=zh
```

## 查看 artifacts
- 列表：`GET http://localhost:4001/api/v1/circuit-agent/artifacts`
- 单个：`GET http://localhost:4001/api/v1/circuit-agent/artifacts/<filename>`

## 常见问题
- 缺少系统提示词：确认 `ReviewAIPrompt/` 下文件非空，否则后端将 fail-fast。
- 422：识别置信度不足或网表冲突，建议复核提示词与输入质量。
- 超时：确认上游/检索超时配置（60–120s）与网络可达性。
