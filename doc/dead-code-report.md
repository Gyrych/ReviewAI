# Dead Code Report（建议稿）

目的：识别长期未触达/未引用的导出符号与文件，提供清理建议与回滚策略（覆盖 FR-008）。

## 生成方法（建议）
- 运行：
  - `npx ts-prune > doc/dead-code-report.md`（仅建议，需人工复核）
  - `npx depcruise src --output-type text >> doc/dead-code-report.md`（可选）

## 初步观察（手工）
- 暂未发现明显的未引用导出；建议按版本节点（里程碑）定期复核。

## 清理与回滚策略
- 先在分支执行清理并通过 CI；
- 提交 PR，至少两位审批者（含维护者）同意后合入；
- 保留回滚点，必要时快速 revert。
