# data-model.md

## Entities

- **PromptFile**
  - `path`: string - 文件相对路径（`ReviewAIPrompt/{agent}/{filename}`）
  - `lang`: string - 语言（`zh`/`en`）
  - `agent`: string - 所属 agent（`circuit-agent`/`circuit-fine-agent`）
  - `variant`: string - 变体（`initial`/`revision`/其他）
  - `contentSummary`: string - 简短摘要（用于诊断）

- **ServiceReadme**
  - `path`: string - README 文件路径
  - `language`: string - `zh` 或 `en`
  - `sectionsPresent`: string[] - 列出存在的必需章节（如 API、Quickstart、Mermaid 流程图）

## Validation Rules

- 所有 `PromptFile.path` 必须位于 `ReviewAIPrompt/` 下且文件非空。
- `ServiceReadme.sectionsPresent` 必须包含至少：`API 列表`、`示例调用`、`启动/停止`、`依赖说明`、`Mermaid 流程图`。

## State Transitions (if applicable)

- `PromptFile`:
  - `missing` -> `added` (在文件被创建后)
  - `present_but_empty` -> `failed_validation` (需修复)
  - `present_and_valid` -> `loaded` (在 `preloadPrompts()` 成功后)



