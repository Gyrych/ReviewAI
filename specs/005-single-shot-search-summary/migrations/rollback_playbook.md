# 回滚演练手册（24 小时回滚验证窗口）

目标：在移除旧多轮实现或执行其他高风险变更时，提供可执行的回滚演练步骤与验收准则，观察期为 24 小时。

演练步骤：

1. 预检（T-1）
   - 通知受影响团队并确保备份已完成（`scripts/backup/backup_multi_round.ps1`）。
   - 验证备份可恢复（`specs/005-single-shot-search-summary/migrations/rollback_multi_round.ps1`）。

2. 变更窗口（T0）
   - 在低流量时间窗口执行迁移脚本（参见 `specs/005-single-shot-search-summary/removal_migrations/`）。
   - 启动服务，运行 smoke tests（`/health`、关键路由）。

注意：在执行迁移脚本时先运行 `-DryRun` 模式以确保文件列表与删除目标无误。

3. 观察期（T0 .. T0+24h）
   - 监控错误率、日志异常、延迟与业务指标；若在观察期内出现严重回退指标，立即执行回滚脚本并记录事件。

4. 验收准则
   - 服务稳定运行 24 小时且关键接口无异常：PASS。
   - 若出现错误率显著上升或关键路由失败：触发回滚并记录问题复盘：FAIL。

5. 报告与记录
   - 在 `specs/005-single-shot-search-summary/migrations/validation_report.md` 附加实际演练结果与日志片段。


