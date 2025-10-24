# README 同步检查（services/circuit-agent）

检查目标：对比 `services/circuit-agent/README.md` 与 `services/circuit-agent/README.zh.md` 的关键段落：API 列表、快速开始（启动）、运行时依赖/环境变量。

发现：

- 两份 README 均包含 **Quickstart / 快速开始**（安装、启动）段落，内容在示例命令与步骤上基本一致（均建议通过仓库根的 `start-all.js` 启动或使用 `npm run dev`）。
- 两份 README 均列出运行时环境变量（`PORT`、`OPENROUTER_BASE`、`REDIS_URL`、`STORAGE_ROOT` 等），描述一致。
- 两份 README 在 **Major APIs / 主要 API** 部分列出了相同的端点（`/health`、`/progress/:id`、`/system-prompt`、`/orchestrate/review`、`/modes/direct/review`、`/sessions/*`、`/artifacts`），参数与返回示例也基本对齐。

差异与建议：

- 文本细微差异：英文 README 在某些说明（如 `PromptLoadError` 的描述）用词与中文略有不同，属语言风格差异，可忽略。
- 建议在两份 README 中明确标注 `STORAGE_ROOT` 的默认路径（当前两份均提到默认为仓库内，但未给出具体相对路径），以便运维与 CI 配置时能更明确。
- 建议在两份 README 中加入 `specs/003-validate-code-against-constitution/prompt-validation.json` 的位置说明（提示词校验脚本写入位置），便于审计。

结论：

- `services/circuit-agent/README.md` 与 `services/circuit-agent/README.zh.md` 在关键段落上等效，满足任务 T018 的基本验收标准。建议接受并在 `CURSOR.md` 中追加变更记录。


