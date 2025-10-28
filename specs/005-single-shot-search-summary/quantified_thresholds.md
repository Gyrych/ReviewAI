# 量化阈值与非功能定义（草案）

本文件包含为 `specs/005-single-shot-search-summary` 规划的可量化阈值与验证基线，用于实现与回归测试。

- context_scale:
  - low: 约 1024 tokens（面向低成本、快速召回）
  - medium: 约 4096 tokens（常规场景）
  - high: 约 8192 tokens（高召回/高质量场景）

- 超时:
  - soft_timeout_ms: 10000 (10s) — 触发预警/中止上游调用
  - hard_timeout_ms: 15000 (15s) — 强制中止并返回受控错误

- 预算/令牌限制:
  - 默认 token_budget: 8192 tokens（可按请求覆盖）
  - 当预算触发时应记录事件并返回受控错误，不应导致未定义行为

- 可观测指标阈值（建议用于 CI 回归验证）:
  - 请求计数（单轮）: 必须为 1（SC-001）
  - P95 时延下降目标: >= 30% 相对旧多轮实现（SC-002）


请在实现阶段将这些阈值映射到具体的监控/测试用例，并在 `specs/005-single-shot-search-summary/quantified_thresholds.md` 中记录任何调整。
