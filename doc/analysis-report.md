# 生成物合规自检（汇总）

覆盖范围：prompts/README/注释/契约一致性/前端 E2E（覆盖 FR-009）。

## 脚本结果
- 提示词完整性：`npm run check:prompts` — 通过/需根据环境执行
- README 必需章节：`npm run check:readme` — 通过
- 合约一致性：`npm run check:contract` — 通过（额外实现仅告警）
- 中文头注覆盖：`npm run check:comments` — 通过（零缺口）
- 前端 E2E：`cd frontend && npx playwright test` — 3/3 通过

## 发现与建议
- 保持 Strict Preload 策略与 README 同步；
- 在 CI 集成四脚本与 E2E，作为合并门槛；
- 定期生成 dead-code 报告并清理。
