<!--
  Prompt improvements and schema for single-pass vision recognition
  This document is written in English to match the single-pass vision prompt language.
-->

# Prompt improvements for single-pass vision recognition

Purpose
- Document the rationale, required schema and examples for the enhanced single-pass (single-pass) vision prompt used by `backend/src/vision.ts`.

When to use
- This prompt is used when the system runs in single-pass recognition mode (recognitionPasses == 1). It is intentionally strict and returns only one JSON object to reduce parsing ambiguity downstream.

Top-level schema summary
- Required top-level keys:
  - `components` (array): list of components (each with id, type, confidence, optional label/params/pins/notes)
  - `connections` (array): list of connections with `from` and `to` objects (componentId, pin) and optional confidence
  - `metadata` (object): minimal metadata (source_type, timestamp, overall_confidence, inference_time_ms)
  - optional `errors` (array): structured parsing issues

Component object details
- Required:
  - `id` (string)
  - `type` (string) — canonical type: one of `resistor, capacitor, inductor, diode, transistor, op-amp, ic, connector, fuse, crystal, oscillator, transformer, other`
  - `confidence` (number) — 0.0 to 1.0
- Optional but recommended:
  - `label` (string) — exact visible text as seen
  - `params` (object) — standardized parameter map; may include:
    - `value_numeric` (number)
    - `value_unit` (string)
    - `tolerance` (string)
    - `voltage_rating` (string)
    - `package` (string)
    - `manufacturer_part` (string)
  - `pins` (array of strings)
  - `notes` (string)

Connection object details
- Each connection must include `from` and `to`, where each is an object with `componentId` and `pin` (strings). Optionally include `confidence`.

Metadata
- `source_type`: "image" or "pdf"
- `timestamp`: ISO 8601 string
- `overall_confidence`: number 0.0 - 1.0
- `inference_time_ms`: number

Standardization rules (applied by the prompt and expected from model)
- Normalize component types to the canonical set (map common abbreviations/synonyms to canonical names).
- Normalize numeric values and units: e.g., "10k", "10kΩ", "10 kohm" -> `value_numeric: 10000`, `value_unit: "Ω"` and keep readable string in `label` if present.
- Normalize common unit symbols (`Ω`, `µF`, `nF`, `pF`, `V`, etc.).
- For ambiguous or low-confidence items (confidence < 0.5) still return the item, set `confidence` accordingly, add a short `notes`, and include an entry in top-level `errors` describing the ambiguity.

Fallback behavior
- A concise fallback prompt is provided when the primary prompt fails; it follows the same schema and returns a minimal JSON object only.

Example minimal output
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

Implementation notes
- The authoritative prompt text is implemented in `backend/src/vision.ts` in `generateGeneralRecognitionPrompt()` and `fallbackPromptText`.
- The canonical prompt file for versioning and review is `ReviewAIPrompt/single_pass_vision_prompt.md` — keep it in sync with `backend/src/vision.ts`.
- Any future schema changes should be reflected both in this doc and in the prompt text to keep model guidance and downstream parser aligned.

Contact
- For questions or modifications, update this file and notify the reviewer responsible for vision pipeline changes.

# 提示词改进清单（多模态图片解析）

目标：指导视觉+LLM 模型按可验证的步骤输出结构化结果并在低置信或冲突时触发人工确认。

1. Prompt 模板（总体流程声明）

```
You are a multimodal circuit extraction system. Follow this exact pipeline:
1) Visual detection of components and pins. Output candidate bounding boxes.
2) OCR to extract silk/labels. Align OCR text to nearest components.
3) Match detected components to BOM/library entries; output match scores.
4) Infer nets by tracing wires; list connected pins per net.
5) Produce final JSON following circuit-schema.json and an overlay (SVG + mapping).
6) For any entity or net with confidence < 0.9, include it in `uncertainties` and stop for human confirmation.
Always include metadata: model_version, random_seed, inference_time_ms.
```

2. 关键输出约束（要严格返回）

- `components[]`（含 pins）
- `nets[]`（含 connected_pins）
- `metadata`
- `overlay`（SVG 以及 mapping）
- `uncertainties`（若存在）

3. 错误处理与复核触发

- 若 OCR 与 BOM 标号冲突，优先 BOM 并把冲突记录在 `uncertainties`。
- 若 net inference 涉及平行候选（例如多条近似路径），返回候选路径并给出置信度。


