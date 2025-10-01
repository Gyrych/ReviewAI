# 单 Agent 历史记录修订轮判定与日志增强 PRD（中文）

## 背景

在“电路图单 agent 评审”流程中，系统需在首轮与修订轮之间做出正确判定，以决定加载 `system_prompt_initial_*.md` 或 `system_prompt_revision_*.md`。当前实现仅以 `history.length > 0` 判定为修订轮，存在误触发风险（例如空占位项、无意义历史导致误判）。

## 目标

1. 提高修订轮判定的健壮性：当且仅当 `history` 中包含“上一轮生成报告片段（报告标识）”或存在“至少一条非空文本的 user/assistant 消息”时，判定为修订轮。
2. 在日志中记录 `history` 的关键信息，便于快速排查“因何被判定为修订轮”。

## 约束

- 不修改现有 API 契约与请求体结构。
- 不引入环境变量开关；默认输出摘要日志即可，满足排查需求。
- 日志避免落盘二进制附件，仅打印文本预览（截断）。

## 判定规则（isRevisionByHistory）

输入：`history: Array<{ role?: string; content?: string } | any>`

返回 true（修订轮）的条件满足其一：
- 报告片段标识存在：任意一项 `content`（字符串）包含下列任一标记（不区分大小写）：
  - "## 元信息"
  - "## 本轮修订摘要"
  - "## 评审报告" 或 "【评审报告】"
  - "## metadata" / "## revision summary" / "## review report"
- 至少一条“有意义历史项”：存在一条 `role ∈ {user, assistant}` 且 `content.trim().length ≥ 1` 的消息。

否则返回 false（视为首轮）。解析失败或 `history` 非数组时，也返回 false。

## 日志增强（摘要）

在路由处理时（`directReview.ts`、`orchestrate.ts`）：

- 打印 `historyLength`、`nonEmptyCount`、`roles[]`（按顺序），用于快速了解整体结构。
- 打印样例内容预览：
  - 当 `history.length <= 6`：逐项打印 `sample[i].role` 与 `content` 的前 200 字符（超出以 `...` 表示）。
  - 当 `history.length > 6`：打印前 3 条与后 3 条，形成窗口视图，控制日志体量。

示例日志：

```
[history] length=3, nonEmpty=2, roles=["user","assistant","user"]
[history] sample[0].role=user, content="帮我评审这个电路……"
[history] sample[1].role=assistant, content="这是上一轮的【评审报告】……"
```

## 影响范围

- 代码：
  - `services/circuit-agent/src/interface/http/routes/directReview.ts`
  - `services/circuit-agent/src/interface/http/routes/orchestrate.ts`
- 文档：
  - 本 PRD 文件（新增）
  - `CURSOR.md` 变更记录与主体说明更新

## 回滚策略

保留原始基线逻辑 `history.length > 0` 的实现容易恢复；若需要回滚，仅需将 `isRevision` 计算回退，并移除新增日志行。


