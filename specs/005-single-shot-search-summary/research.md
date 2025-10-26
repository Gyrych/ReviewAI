# Research: 单次交互的搜索+摘要实现决策记录

## Unknowns Identified (from Technical Context)

1. **OpenRouter 在线搜索能力的稳定性与返回引用格式** — NEEDS CLARIFICATION
2. **引用注解（Citation）标准化字段与存储方案（DB vs JSON artifact）** — NEEDS CLARIFICATION
3. **前端如何兼容新增引用字段以保证向后兼容** — NEEDS CLARIFICATION
4. **迁移/删除多轮模式数据的安全回滚方案** — NEEDS CLARIFICATION

## Research Tasks

- Task: "Research OpenRouter online search response format and citation annotation" — 查阅官方示例并验证是否能在单次响应中获得标准化引用。
- Task: "Design Citation data model (fields, indexing, FK to AnnotatedMessage)" — 评估使用现有 artifact 存储 vs 小型 DB 表的利弊。
- Task: "Frontend compatibility plan" — 评估前端渲染层对引用字段的兼容策略（渐进增强 vs 强制更新）。
- Task: "Migration and rollback design" — 设计一次性迁移脚本、备份策略与回滚步骤，确保删除多轮字段可回放。

## Decisions

- Decision: 采用 OpenRouter 的 `:online` 能力作为首选（assumption 基于 spec 中的描述），并在提供方不支持时回退到 Exa（只在自动策略内生效）。
- Decision: Citation 作为独立实体存储，采用 JSON Schema 定义字段并写入后端 DB（轻量化表）以便索引与审计；同时将原始模型响应写入 artifact 存储以供复现。
- Decision: 前端采用渐进增强策略：后端在响应中新增 `citations` 字段，但保持主文本字段与早期结构不变；前端在兼容旧字段的同时显示新引用卡片（若存在）。
- Decision: 迁移策略：先导出现有多轮数据为备份文件；执行脚本移除旧字段并生成回滚脚本；在迁移前通过 CI 执行回归测试。

## Rationale

- 兼顾审计与性能：将 Citation 作为独立可索引实体便于后续审计、统计与回溯；保留原始响应 artifact 提高可追溯性。
- 最小化前端风险：渐进增强允许不破坏旧客户端，同时逐步推广新体验。

## Alternatives Considered

- 存储 Citation 仅在 artifact JSON 中：更简单，但难以高效索引与展示。
- 在前端强制升级旧结构：速度快但会导致兼容性中断。

## Next Steps (Phase 1 inputs)

1. 定义 `data-model.md`（AnnotatedMessage、Citation、RoundConfig）
2. 生成 OpenAPI contract（POST /orchestrate/review 输出包含 citations）
3. 编写 `quickstart.md` 指导如何本地运行与验证单次搜索+摘要


