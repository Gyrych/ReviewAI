# 回放验证报告（示例）

此文档记录迁移脚本回放后的验证步骤与结果示例。

验证点：

- 备份完整性：备份包可解包并包含 `services/`、`frontend/`、`ReviewAIPrompt/` 等目录。
- 服务启动：在回放后能够启动 `services/circuit-agent` 并返回 `/health` 200。
- Contract checks：`scripts/check-contract-implementation.js` 在回放后仍通过（或给出兼容性警告）。
- 数据库一致性：若有 DB 变更，能够在回滚后恢复到原始 schema 并验证示例查询。

示例结果：

- 备份检查：PASS
- 解包检查：PASS
- 启动检查：PASS
- Contract checks：PASS（1 warning: structured routes deprecated）
- DB 一致性：PASS

备注：此文件为回放验证模板；实际回放请在本地执行迁移脚本并替换本文件内容为真实验证结果。


