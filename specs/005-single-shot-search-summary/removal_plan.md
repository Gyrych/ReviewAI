# Removal plan — 退役旧多轮实现

此文档描述退役仓库中“旧多轮（multi-round）”实现的计划、验证与回滚步骤，目的是在降低风险的前提下安全迁移到单轮（single-shot）实现。

目标：
- 识别并安全移除与旧多轮实现直接相关的代码路径、脚本与文档；
- 为移除操作提供可回放的迁移脚本与回滚方案；
- 保证在移除期间服务可回滚至原始状态且生产数据得到妥善备份与验证；
- 更新 README 与运维文档以反映单轮默认行为与回退方法。

步骤概述：
1. 发现阶段
   - 列出候选移除路径（示例）：`services/*/src/app/usecases/StructuredRecognitionUseCase*`、`services/*/src/interface/http/routes/structured*`、`frontend/src/agents/*` 中旧多轮表单；
   - 在代码库中 grep 所有 `structured` / `multi` / `aggregate` 关键词以确认影响范围。

2. 备份阶段（必需）
   - 执行脚本：`scripts/backup/backup_multi_round.ps1` 生成完整备份（输出于 `specs/005-single-shot-search-summary/backups/`）；
   - 验证备份可解包并且包含关键文件（迁移脚本会检查备份完整性）。

3. 标记与迁移阶段
   - 在 `specs/005-single-shot-search-summary/migrations/` 中添加可回放迁移脚本（删除/移动/重命名操作均以脚本化形式执行）；
   - 将受影响接口用 `410 Gone` 或 API 兼容策略退役（保留兼容层与明确错误消息）。

4. 验证阶段
   - 执行 CI 流水线（包含 contract checks 与 quickstart 验证）；
   - 本地回放：运行迁移脚本后启动服务并执行 smoke tests（`/health`、关键路由、artifact 列表）；
   - 收集并归档回放报告 `specs/005-single-shot-search-summary/migrations/validation_report.md`。

5. 回滚计划
   - 使用 `specs/005-single-shot-search-summary/migrations/rollback_multi_round.ps1 <backup-file>` 恢复被删除文件；
   - 回滚后执行完整 smoke tests，并比对 `validation_report.md` 中的检查点；
   - 若数据库结构变更，使用备份数据库快照并在恢复后执行数据一致性检查。

6. 发布与通告
   - 在 README（中/英）中记录退役说明、替代指引与回滚步骤；
   - 通知维护人员与消费者（邮件/Slack/运维频道），并在变更窗口内监控错误率与日志异常。

验收准则：
- 迁移脚本执行成功且可回滚；
- 单元/集成 smoke tests 通过；
- README（中/英）已同步更新并包含回滚与验证步骤；
- 监控/日志无异常升高（24 小时窗口为建议观察期）。

联系方式：如需协助请联系项目维护者 `gyrych@gmail.com`。


