# Overlay 可视化规范（SVG + JSON mapping）

此规范定义前端展示 overlay 的格式与后端如何生成映射，便于人工核对与修正。

1. 输出文件

- `<image_id>.overlay.svg`：SVG 图形，包含每个组件边界、引脚点与网络高亮路径。
- `<image_id>.overlay.json`：JSON 映射，描述 SVG 元素 id 到 `circuit` JSON 实体的映射及置信度。

2. SVG 元素命名约定

- 组件群组：`comp-<componentId>`（例如 `comp-U1`）
- 引脚点：`pin-<componentId>-<pinId>`（例如 `pin-U1-1`）
- 网线路径：`net-<netId>`（例如 `net-N1`）

3. overlay.json 结构示例

```json
{
  "image_id":"img-1",
  "mapping":{
    "comp-U1": {"component_id":"U1","confidence":0.98},
    "pin-U1-1": {"component_id":"U1","pin_id":"1","confidence":0.96},
    "net-N1": {"net_id":"N1","confidence":0.92}
  }
}
```

4. 颜色/高亮策略（建议）

- confidence >= 0.9：绿色（自动接受）
- 0.6 <= confidence < 0.9：黄色（需要复核）
- confidence < 0.6：红色（强制复核）

5. 交互行为

- 点击 SVG 元素应返回对应 `mapping` 中的实体，前端允许用户修改属性（例如引脚序号或 net 关联），并将修改后的 JSON 提交回后端进行二次验证。


