# Phase 0 Research — Review Flow Cleanup and Pipeline Assurance

本研究用于解决 Technical Context 中的所有 “NEEDS CLARIFICATION”，并沉淀关键决策、理由与备选。

## 1) 摘要默认字数限制
- Decision: 1024 词
- Rationale: 与现有实现与提示词约定匹配，足以覆盖关键论据且控制 token 成本。
- Alternatives considered: 512（信息密度不足）、2048（成本升高且收益递减）。

## 2) artifact 保留期与清理策略
- Decision: 开发环境手动清理；生产建议 30 天可配置（通过环境变量，例如 `ARTIFACT_TTL_DAYS`）。
- Rationale: 开发期需要可追溯；生产期需平衡审计与存储成本。
- Alternatives considered: 无限期保留（存储成本与合规风险高）；即时删除（不利于审计与复现）。

## 3) 跨服务共享目录策略
- Decision: 统一通过 `STORAGE_ROOT` 指定根目录，子服务在其下管理 `artifacts/` 与 `sessions/`。
- Rationale: 降低路径分歧，便于统一清理与权限控制。
- Alternatives considered: 各服务独立默认路径（维护与清理复杂，跨服务引用困难）。

## 4) 上游/检索超时策略
- Decision: 识别/检索/评审分别为 60s/90s/120s（按部署可调）；失败早返回并记录 timeline + artifacts。
- Rationale: 满足“在 3 秒内出现首条事件+持续反馈”的体验，同时兼顾上游不确定性。
- Alternatives considered: 统一 120s（响应慢）；统一 60s（失败率高）。

## 5) 技术栈与约束（核对）
- Decision: 后端 Express + TypeScript；前端 Vite + React；ESLint/Prettier + TS strict；文件系统存储。
- Rationale: 与现仓库实现一致（已在 `services/circuit-agent` 中检索到 `express` 依赖）。
- Alternatives considered: Fastify（切换成本）；数据库持久化（当前阶段不必要）。

## 6) 安全与合规
- Decision: 不在日志与 artifacts 中记录密钥；artifact 建议 ≤5MB，超出时压缩/分片或外链。
- Rationale: 与宪章“附加约束与安全合规”一致；降低泄露与存储成本风险。
- Alternatives considered: 不限大小（成本不可控）；日志脱敏后记录凭据（残留风险）。

---

本文件完成后，`plan.md` 的 Technical Context 中的 “NEEDS CLARIFICATION” 已全部有据可依；后续 Phase 1 将据此输出数据模型、契约与 quickstart。


