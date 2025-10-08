# 电路结构化描述规范（Circuit Schema）

本文件为图片->结构化描述（JSON/YAML）输出的规范说明，配合 `backend/schemas/circuit-schema.json` 使用。

注意：字段说明使用中文注释。

1. 顶层对象 `circuit`（建议直接以 schema 顶层返回）

- `components`：元件数组。每项包含：
  - `id`：唯一元件标识，优先使用丝印/原理图标注（例如 `U1`, `R3`）。
  - `type`：器件类别（如 `IC`, `Res`, `Cap`, `Connector`）。
  - `footprint`：封装（例如 `SOIC-8`）。
  - `value`：器件值（带单位，如 `10k`, `1uF`）。
  - `pins`：引脚数组，每个引脚包含：
    - `pin_id`：脚号或脚名（字符串）。
    - `pin_name`：可选，逻辑名称（如 `VCC`）。
    - `x`, `y`：坐标（数值）。
    - `units`：坐标单位，`px` 或 `mm`。
    - `coord_system`：坐标系，`image`/`board`/`package`。
    - `rotation`：旋转角度（度）。
    - `mirror`：是否镜像（布尔）。
    - `confidence`：识别置信度（0-1）。

- `nets`：网络数组。每项包含：
  - `net_id`：唯一网络标识。
  - `name`：可选网络名（例如 `VCC`, `GND`, `CAN_H`）。
  - `connected_pins`：连接的引脚列表，格式为 `<componentId>.<pinId>`（例如 `U1.1`）。
  - `signal_type`：`power`/`gnd`/`signal`/`analog`/`diff`/`unknown`。
  - `confidence`：网络识别置信度（0-1）。

- `metadata`：推理元数据（最小必填）：`source_type`（image/pdf）、`timestamp`（UTC ISO 8601）、`overall_confidence`（0-1）、`inference_time_ms`；推荐包含 `image_id`, `image_resolution`, `model_version`, `random_seed`, `warnings`。

- `uncertainties`：可选，列出低置信或冲突项及候选解释。

2. 坐标与单位约定

- 首选板级 mm（当 PCB 机械基准/丝印/尺寸可用时），否则使用 image 像素坐标。
- 必须在每个引脚对象中声明 `units` 与 `coord_system`。
- 若做坐标系转换，需在 `metadata` 中说明转换方法与参考点。

3. 命名与唯一标识

- 组件 id 应遵循丝印或原理图标注；若缺失，应生成 `TypeNN`（例如 `R01`）并在 `metadata.warnings` 中说明。
- 引脚引用统一格式 `<componentId>.<pinId>`，后端与前端均以此格式建立映射。

4. 置信度与复核策略（建议）

- 自动接受：confidence >= 0.90
- 需要人工复核：0.60 <= confidence < 0.90
- 强制人工复核：confidence < 0.60
- 若关键网络（电源/地/接口）中任一关联引脚 confidence < 0.90，应触发人工复核。

5. 交叉校验优先级

1. 原理图 netlist
2. BOM 标号与器件库匹配
3. 丝印 OCR 文本
4. 纯视觉推断

若存在冲突，应把冲突项加入 `uncertainties` 并列出证据与建议操作（例如使用原理图优先，或请求用户确认）。

6. Overlay 与可视化

- 推荐在保存 enriched JSON 时同时保存 `overlay.svg` 与 `overlay.json`（映射 SVG 元素 id 到 JSON 实体），便于前端高亮与人工修正；响应体仍可直接返回 overlay 供 UI 使用。

7. 示例（节选）

```json
{
  "components": [
    {
      "id": "U1",
      "type": "IC",
      "footprint": "SOIC-8",
      "pins": [
        {"pin_id":"1","x":120.5,"y":220.1,"units":"px","coord_system":"image","confidence":0.98},
        {"pin_id":"2","x":120.5,"y":240.3,"units":"px","coord_system":"image","confidence":0.95}
      ]
    }
  ],
  "nets": [
    {"net_id":"N1","name":"VCC","connected_pins":["U1.1","J1.1"],"signal_type":"power","confidence":0.92}
  ],
  "metadata": {"image_id":"img-20250917-1","image_resolution":"4000x3000","model_version":"v0.1","inference_time_ms":1234}
}
```

8. 版本与追溯

- 每次生成的 JSON 应记录 `model_version` 与 `random_seed` 并保存到 `backend/uploads/enriched_<YYYY-MM-DDTHH-mm-ssZ>.json`（UTC ISO 8601）以便回溯与离线分析。


