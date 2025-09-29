<!--
  单轮视觉识别的提示词改进与输出 schema（已翻译为中文）
  本文档现已统一为中文，示例 JSON 保持字段英文以便与代码契约一致。
-->

# 单轮视觉识别的提示词改进

目的

记录单轮视觉识别提示词的设计理由、输出 schema 要求与示例，供提示词版本化与审核使用。

适用场景

当系统以单轮识别运行（recognitionPasses == 1）时使用。此模式要求模型仅返回单个 JSON 对象，以降低下游解析歧义。

顶层 Schema 要点

必需的顶层键：

- `components`（数组）：元件列表（每项包含 id/type/confidence，可选 label/params/pins/notes）
- `connections`（数组）：连接列表，包含 `from` 与 `to` 对象（componentId、pin），可选 confidence
- `metadata`（对象）：最小元数据（source_type、timestamp、overall_confidence、inference_time_ms）
- 可选 `errors`（数组）：结构化的解析问题

元件对象说明

必需：

- `id`（字符串）
- `type`（字符串）— 规范类型：如 `resistor, capacitor, inductor, diode, transistor, op-amp, ic, connector, fuse, crystal, oscillator, transformer, other`
- `confidence`（数值）— 0.0 到 1.0

建议包含（可选）：

- `label`（字符串）— 视觉可见文本
- `params`（对象）— 规范化参数，可能包含：
  - `value_numeric`（数字）
  - `value_unit`（字符串）
  - `tolerance`（字符串）
  - `voltage_rating`（字符串）
  - `package`（字符串）
  - `manufacturer_part`（字符串）
- `pins`（字符串数组）
- `notes`（字符串）

连接对象说明

每个连接需包含 `from` 与 `to`，各为包含 `componentId` 与 `pin` 的对象（字符串）。可选 `confidence`。

元数据

- `source_type`: "image" 或 "pdf"
- `timestamp`: ISO 8601 字符串
- `overall_confidence`: 数值 0.0 - 1.0
- `inference_time_ms`: 数值

标准化规则（由提示词执行并期望模型输出）

- 将元件类型规范化为预定义集合（例如将 `R`/`res` 映射为 `resistor`；`U`/`IC` 映射为 `ic`）。
- 规范化数值与单位：例如 "10k", "10kΩ", "10 kohm" → `value_numeric: 10000`, `value_unit: "Ω"`，同时在 `label` 中保留可读字符串。
- 规范常见单位符号（Ω、µF、nF、pF、V 等）。
- 对于低置信或模糊项（confidence < 0.5），仍应返回该项，设置相应 `confidence` 并在 `notes` 中说明，同时在顶层 `errors` 中加入对应条目。

回退行为

当主提示词失败时，应使用简洁回退提示词，其输出遵循相同 schema 并返回最小化的 JSON 对象。

示例最小输出

```json
{
  "components": [
    {"id": "U1", "type": "ic", "label": "AD825", "params": {"manufacturer_part": "AD825"}, "confidence": 0.95},
    {"id": "R1", "type": "resistor", "label": "1kΩ", "params": {"value_numeric": 1000, "value_unit": "Ω"}, "confidence": 0.9}
  ],
  "connections": [
    {"from": {"componentId": "U1", "pin": "1"}, "to": {"componentId": "R1", "pin": "1"}, "confidence": 0.9}
  ],
  "metadata": {"source_type": "image", "timestamp": "2025-01-01T00:00:00Z", "overall_confidence": 0.85, "inference_time_ms": 1234}
}
```

实现说明

当前实现：代码库中**未**包含 `backend/src/vision.ts` 或 `generateGeneralRecognitionPrompt()` / `fallbackPromptText` 等函数。

现实情况：视觉 provider 在 `services/circuit-agent/src/infra/providers/OpenRouterVisionProvider.ts` 与 `services/circuit-agent/src/infra/providers/OpenRouterVisionChat.ts` 中使用内联的 system prompt 字符串驱动模型。

版本控制位置：仓库包含用于版本化与人工审核的 canonical prompt 文件，位于 `ReviewAIPrompt/`（例如 `single_pass_vision_prompt.md`）。但目前没有统一的运行时机制自动将这些 Markdown 文件加载并注入到 provider 中。

建议：将提示词外置并实现 `PromptRepository`（例如 `PromptRepositoryFs`），使 provider 在运行时从 `ReviewAIPrompt/` 加载对应的提示词，从而避免提示词版本漂移并支持版本化与缓存。

若未来 schema 变更，请同时更新本文件与 `ReviewAIPrompt/` 中对应的提示词文本以保持一致。

联系

如有问题或需修改，请直接编辑此文件并通知负责视觉流水线的评审者。

---

## 提示词改进清单（多模态图片解析）

目标：指导视觉+LLM 模型按可验证的步骤输出结构化结果并在低置信或冲突时触发人工确认。

1. Prompt 模板（总体流程声明）

```text
You are a multimodal circuit extraction system. Follow this exact pipeline:
1. Visual detection of components and pins. Output candidate bounding boxes.
2. OCR to extract silk/labels. Align OCR text to nearest components.
3. Match detected components to BOM/library entries; output match scores.
4. Infer nets by tracing wires; list connected pins per net.
5. Produce final JSON following circuit-schema.json and an overlay (SVG + mapping).
6. For any entity or net with confidence < 0.9, include it in `uncertainties` and stop for human confirmation.
Always include metadata: model_version, random_seed, inference_time_ms.
```

1. 关键输出约束（必须严格返回）

- `components[]`（含 pins）
- `nets[]`（含 connected_pins）
- `metadata`
- `overlay`（SVG 以及 mapping）
- `uncertainties`（若存在）

1. 错误处理与复核触发

- 若 OCR 与 BOM 标号冲突，优先 BOM 并把冲突记录在 `uncertainties`。
- 若 net inference 涉及平行候选（例如多条近似路径），返回候选路径并给出置信度。
