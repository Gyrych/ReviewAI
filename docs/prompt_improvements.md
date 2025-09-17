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


