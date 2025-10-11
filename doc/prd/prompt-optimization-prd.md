# 提示词系统优化与重构 PRD

## 文档元信息

| 字段 | 值 |
|------|-----|
| 项目名称 | 电路图 AI 评审系统 - 提示词优化 |
| 文档版本 | v1.0 |
| 创建日期 | 2025-10-01 |
| 作者 | AI 助手（GPT-5 Mini） |
| 状态 | 实施中 |

## 1. 项目背景

### 1.1 现状问题

当前电路图 AI 评审系统存在以下问题：

1. **提示词管理混乱**：部分 provider 使用内联硬编码 system prompt，与 `ReviewAIPrompt/` 文件内容不同步，存在版本漂移风险
2. **电路图评审（主副模型架构）/电路图评审（委员会架构） 提示词未隔离**：所有提示词文件混放在 `ReviewAIPrompt/` 根目录，职责不清晰
3. **缺乏首轮/修订轮差异化**：当前提示词未针对首轮评审与修订轮评审的不同需求进行优化
4. **中英文提示词不同步**：现有 `SystemPrompt.md` 与 `系统提示词.md` 内容存在差异，维护困难
5. **运行时加载机制缺失**：provider 无法根据语言与评审轮次动态加载对应提示词

### 1.2 业务目标

- **减少人工复核工时**：通过优化提示词减少模型输出的澄清问题，直接输出评审结论
- **提升评审质量**：确保每条结论附可追溯证据，符合严谨学术与工程直接风格
- **支持国际化**：中英文提示词语义等效，前端语言切换时自动使用对应提示词
- **提高系统可维护性**：提示词文件化、版本化、隔离化管理

## 2. 需求分析

### 2.1 核心需求（P0）

#### 2.1.1 输出格式统一
- **要求**：只输出以【评审报告】开头的评审结论，不输出结构化 JSON 描述和问题确认清单
- **处理信息不足**：在报告的"假设与限制"章节说明，不中断评审流程

#### 2.1.2 电路图评审（主副模型架构）/电路图評審（委员会架构） 提示词完全隔离
 - **电路图评审（主副模型架构）模式**：
  - 服务：`services/circuit-agent`（端口 4001）
  - 前端名称："电路图评审（主副模型架构）"
  - 提示词目录：`ReviewAIPrompt/circuit-agent/`
  - 文件清单：
    - `system_prompt_initial_zh.md`（首轮 - 中文）
    - `system_prompt_initial_en.md`（首轮 - 英文）
    - `system_prompt_revision_zh.md`（修订轮 - 中文）
    - `system_prompt_revision_en.md`（修订轮 - 英文）

 - **多 agent 模式（命名更新为 电路图评审（委员会架构））**：
  - 服务：`services/circuit-fine-agent`（端口 4002）
  - 前端名称："电路图评审（委员会架构）"
  - 提示词目录：`ReviewAIPrompt/circuit-fine-agent/`
  - 文件清单：
    - `system_prompt_zh.md`（系统级 - 中文）
    - `system_prompt_en.md`（系统级 - 英文）
    - `macro_prompt.md`（pass 1）
    - `ic_prompt.md`（pass 2）
    - `rc_prompt.md`（pass 3）
    - `net_prompt.md`（pass 4）
    - `verify_prompt.md`（pass 5）
    - `consolidation_prompt.md`（汇总）

#### 2.1.3 首轮/修订轮差异化
- **首轮评审**：
  - 直接输出【评审报告】
  - 包含完整报告结构（元信息、摘要、需求边界、评审内容、风险清单、改进建议、结论、附录、变更记录）

- **修订轮评审**：
  - 在【评审报告】后立即增加"## 本轮修订摘要"章节
  - 修订摘要包含：变更点编号、原结论、新结论、变更理由、依据来源
  - 提示词中明确指示："这是修订轮评审，请仔细分析历史对话中用户的异议与补充信息，针对性调整评审结论"

#### 2.1.4 中英文语义等效
- **语言选择**：前端用户选择中文页面时使用中文提示词，选择英文页面时使用英文提示词
- **等效要求**：语义等效（非逐字翻译），关键指令、评审维度、格式规范保持一致
- **输出标记**：中英文报告均以【评审报告】开头（保留中文标记符号）

#### 2.1.5 运行时加载机制
- **实现方式**：创建 `PromptLoader` 工具模块，根据 agent 名称、语言、评审轮次动态加载提示词文件
- **缓存策略**：静态缓存（Map），按文件路径缓存内容，避免重复读取
- **错误处理**：提示词文件缺失或为空时立即抛出错误，包含完整路径信息，服务启动失败

### 2.2 评审内容要求（P0）

#### 2.2.1 目标用户
- 内部硬件工程师
- 评审类型：快速概览式评审（非深度合规/认证级）

#### 2.2.2 输入文件支持
- 图片：PNG/JPG/JPEG/WEBP 等（多模态模型直接处理）
- PDF：多页电路原理图（多模态模型直接处理）
- 辅助文档：BOM、datasheet、设计需求文档、设计规范文档、设计方案文档（全部提交给大模型）

#### 2.2.3 评审维度（完整清单）
1. **模拟电路**：拓扑、偏置、带宽、噪声、相位/增益裕度、温漂、ESD/过压/过流保护
2. **数字电路**：时序裕度、上升/下降时间、终端匹配、时钟分布、复位/启动时序、SI 风险
3. **接口与防护**：USB/CAN/Ethernet/RS-485 等终端匹配、共模抑制、浪涌/ESD/EFT 防护路径
4. **电源与 PI**：拓扑选择、环路补偿、纹波/瞬态响应、去耦系统与回流路径、UVLO/OVP/OCP/短路保护
5. **PCB/Layout**：叠层结构、阻抗控制、参考平面完整性、回流路径、长度匹配、过孔、敏感节点隔离
6. **EMC/EMI**：环路与共模路径分析、CM/DM 滤波、端口与电缆约束、屏蔽与接地策略
7. **嵌入式软件**：启动/复位策略、时序依赖、外设默认状态、异常检测与降级、看门狗、低功耗、日志与现场诊断
8. **热设计**：功率分布、热路径、结温估算与裕度、材料/风道/TIM、热点与均衡策略
9. **DFM/DFT**：工艺与可制造性、测试点密度与覆盖、ICT/JTAG/SWD、故障注入、模块化、版本追溯

#### 2.2.4 输出风格
- **语气**：严谨学术、工程直接、专业、自信、简洁、无废话
- **证据要求**：每条结论必须附可追溯的证据字段与引用格式（数据来源、标准条款、计算推导、原理图事实）
- **引用格式**：
  - Datasheet 检索：`source_url`、`retrieved_at`（UTC ISO 8601）、`source_type`（manufacturer/distributor/third-party）
  - 标准引用：`IEC 61000-4-2`、`CISPR 32 Class B`、`FCC Part 15` 等
  - 计算推导：使用 Markdown 数学公式（inline `\( ... \)`、block `\[ ... \]`），标注参数来源

#### 2.2.5 Datasheet 检索规则
- **允许范围**：自动检索元器件 datasheet、规格书、应用笔记、厂商通告、分销商页面
- **优先级规则**：厂商官网与原始 datasheet 优先；如冲突或缺失，选择最新可信来源并标记需人工验证
- **保存位置**：`uploads/datasheets/`
- **命名格式**：`<component>_<yyyyMMddTHHmmss>_<hash>.<ext>`
- **审计元数据**：`component_name`、`query_string`、`retrieved_at`、`source_url`、`source_type`、`document_title`、`document_version_or_date`、`confidence`、`notes`

### 2.3 修订轮机制（P0）

#### 2.3.1 触发条件
- 用户针对【评审报告】中的异议点提交意见
- 系统检测 `history.length > 0` 自动切换为修订轮提示词

#### 2.3.2 输出要求
- 给出修订后的完整报告（非仅回复争议点）
- 在报告开头增加"## 本轮修订摘要"章节

#### 2.3.3 修订摘要格式
```markdown
## 本轮修订摘要

| 变更点 | 原结论 | 新结论 | 变更理由 | 依据来源 |
|--------|--------|--------|----------|----------|
| 1. R3 阻值评估 | 10kΩ 合适 | 建议改为 4.7kΩ | 用户提供实测负载电流 5mA，压降需控制在 0.5V 以内 | 用户补充信息 + 欧姆定律计算 |
| 2. EMC 风险等级 | P1（中） | P0（高） | 用户确认需通过 CE 认证，Class B 限值严格 | IEC 61000-4-2 Level 3 + 用户需求 |
```

#### 2.3.4 轮次限制
- 无最大轮数限制
- 终止条件：用户明确表示不再提交异议

### 2.4 质量阈值（沿用现有规则）

- **自动接受**：置信度 ≥ 0.90
- **人工复核**：0.60 ≤ 置信度 < 0.90
- **强制人工复核**：置信度 < 0.60
- **关键元件/网络**：电源/地/连接器/总线相关引脚或元件置信度 < 0.90 时，在"假设与限制"中说明

## 3. 技术架构设计

### 3.1 文件组织结构

```
ReviewAIPrompt/
├── circuit-agent/                        # 电路图评审（主副模型架构）
│   ├── system_prompt_initial_zh.md       # 首轮 - 中文
│   ├── system_prompt_initial_en.md       # 首轮 - 英文
│   ├── system_prompt_revision_zh.md      # 修订轮 - 中文
│   └── system_prompt_revision_en.md      # 修订轮 - 英文
├── circuit-fine-agent/                   # 电路图评审（委员会架构）
│   ├── system_prompt_zh.md               # 系统级 - 中文
│   ├── system_prompt_en.md               # 系统级 - 英文
│   ├── macro_prompt.md                   # pass 1（从根目录移入）
│   ├── ic_prompt.md                      # pass 2
│   ├── rc_prompt.md                      # pass 3
│   ├── net_prompt.md                     # pass 4
│   ├── verify_prompt.md                  # pass 5
│   └── consolidation_prompt.md           # 汇总
├── SystemPrompt.md                       # 保留（通用参考）
├── 系统提示词.md                          # 保留（通用参考）
├── single_pass_vision_prompt.md          # 保留（通用）
└── README.md                             # 说明文档
```

### 3.2 PromptLoader 模块设计

#### 3.2.1 接口定义

```typescript
// services/circuit-agent/src/infra/prompts/PromptLoader.ts

export class PromptLoadError extends Error {
  constructor(message: string, public readonly path: string) {
    super(`${message} (path: ${path})`);
    this.name = 'PromptLoadError';
  }
}

export class PromptLoader {
  private static cache = new Map<string, string>();

  /**
   * 加载提示词文件
   * @param agentName - agent 名称（'circuit-agent' | 'circuit-fine-agent'）
   * @param promptType - 提示词类型（'system' | 'pass'）
   * @param language - 语言（'zh' | 'en'）
   * @param variant - 变体（'initial' | 'revision' | 'macro' | 'ic' | 'rc' | 'net' | 'verify' | 'consolidation'）
   * @returns 提示词内容
   * @throws PromptLoadError - 文件不存在或为空
   */
  static loadPrompt(
    agentName: string,
    promptType: 'system' | 'pass',
    language: 'zh' | 'en',
    variant?: string
  ): string {
    // 构建文件路径
    let filename: string;
    if (promptType === 'system') {
      if (variant === 'initial' || variant === 'revision') {
        filename = `system_prompt_${variant}_${language}.md`;
      } else {
        filename = `system_prompt_${language}.md`;
      }
    } else {
      filename = `${variant}_prompt.md`;
    }

    const relativePath = `ReviewAIPrompt/${agentName}/${filename}`;
    const absolutePath = path.resolve(process.cwd(), relativePath);

    // 检查缓存
    if (this.cache.has(absolutePath)) {
      return this.cache.get(absolutePath)!;
    }

    // 读取文件
    try {
      if (!fs.existsSync(absolutePath)) {
        throw new PromptLoadError(`Prompt file not found`, absolutePath);
      }

      const content = fs.readFileSync(absolutePath, 'utf-8').trim();

      if (content.length === 0) {
        throw new PromptLoadError(`Prompt file is empty`, absolutePath);
      }

      // 缓存内容
      this.cache.set(absolutePath, content);
      return content;
    } catch (error) {
      if (error instanceof PromptLoadError) {
        throw error;
      }
      throw new PromptLoadError(
        `Failed to load prompt file: ${(error as Error).message}`,
        absolutePath
      );
    }
  }

  /**
   * 清除缓存（用于测试或热更新）
   */
  static clearCache(): void {
    this.cache.clear();
  }
}
```

### 3.3 UseCase 改造

```typescript
// services/circuit-agent/src/app/usecases/DirectReviewUseCase.ts

export class DirectReviewUseCase {
  async execute(params: {
    images: File[];
    dialog: string;
    history: Array<{role: 'user'|'assistant', content: string}>;
    language: 'zh' | 'en';
    // ... 其他参数
  }): Promise<ReviewResult> {
    // 判断是否为修订轮
    const isRevision = params.history.length > 0;

    // 加载对应提示词
    const systemPrompt = PromptLoader.loadPrompt(
      'circuit-agent',
      'system',
      params.language,
      isRevision ? 'revision' : 'initial'
    );

    // 创建 VisionProvider（注入提示词）
    const visionProvider = new OpenRouterVisionProvider({
      apiKey: this.config.openRouterApiKey,
      model: this.config.model,
      systemPrompt,  // 注入
    });

    // 调用 LLM
    const result = await visionProvider.analyze({
      images: params.images,
      userMessage: params.dialog,
      history: params.history,
    });

    // 生成工件与时间线
    // ...
  }
}
```

### 3.4 Provider 改造

```typescript
// services/circuit-agent/src/infra/providers/OpenRouterVisionProvider.ts

export class OpenRouterVisionProvider {
  private systemPrompt: string;

  constructor(config: {
    apiKey: string;
    model: string;
    systemPrompt: string;  // 外部注入
  }) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.systemPrompt = config.systemPrompt;  // 保存
  }

  async analyze(params: {
    images: File[];
    userMessage: string;
    history: Array<{role: string, content: string}>;
  }): Promise<AnalysisResult> {
    // 构建消息
    const messages = [
      { role: 'system', content: this.systemPrompt },  // 使用注入的提示词
      ...params.history,
      { role: 'user', content: params.userMessage },
    ];

    // 调用 OpenRouter API
    // ...
  }
}
```

### 3.5 HTTP 路由改造

```typescript
// services/circuit-agent/src/interface/http/routes/directReview.ts

router.post('/review', async (req, res) => {
  const { images, dialog, history, language = 'zh' } = req.body;

  // 校验 language 参数
  if (!['zh', 'en'].includes(language)) {
    return res.status(400).json({ error: 'Invalid language parameter' });
  }

  // 执行 UseCase
  const useCase = new DirectReviewUseCase(/* ... */);
  const result = await useCase.execute({
    images,
    dialog,
    history,
    language,  // 传递语言参数
  });

  res.json(result);
});
```

### 3.6 前端适配（可选）

```typescript
// frontend/src/components/ReviewForm.tsx

import { useTranslation } from 'react-i18next';

const ReviewForm = () => {
  const { i18n } = useTranslation();

  const submitReview = async () => {
    const response = await fetch('/api/v1/circuit-agent/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images,
        dialog,
        history,
        language: i18n.language === 'zh' ? 'zh' : 'en',  // 传递语言
      }),
    });
  };
};
```

## 4. 提示词内容要点

### 4.1 电路图评审（主副模型架构）首轮提示词（中文）关键指令

```markdown
# 硬件设计评审系统提示词（首轮评审 - 中文）

## 角色定义
你是资深硬件工程师，专业、自信、直接、简洁。

## 评审模式
快速概览式评审（非深度合规认证级）。

## 输出要求
1. **格式**：以【评审报告】开头，使用 Markdown 格式
2. **结构**：必须包含以下章节（不可省略）
   - ## 元信息
   - ## 摘要
   - ## 需求与边界
   - ## 关键指标与合规目标
   - ## 原理图与电路分析
   - ## PCB/Layout 与叠层
   - ## EMC 评审（传导/辐射/ESD/浪涌）
   - ## 嵌入式软件与系统交互
   - ## 热设计与功率预算
   - ## 推导与计算（可复现）
   - ## 风险清单与优先级
   - ## 改进建议（可执行检查清单）
   - ## 结论
   - ## 附录
   - ## 变更记录

3. **信息不足处理**：在"需求与边界"的"假设与限制"小节中说明

4. **证据要求**：每条结论必须附可追溯证据
   - 标准引用：`IEC 61000-4-2`、`CISPR 32 Class B` 等
   - 计算推导：使用 Markdown 数学公式，标注参数来源
   - Datasheet 引用：`source_url`、`retrieved_at`、`source_type`

5. **风险编号**：使用 R# 格式（R1、R2、...），交叉引用时使用"见 R3"

6. **表格规范**：
   - 关键指标与合规目标：`类别 | 指标/限值 | 目标/范围 | 依据/标准 | 当前状态`
   - 风险清单：`ID | 风险 | 影响 | 可能性 | 优先级(P0/P1/P2) | 证据/依据 | 建议 | 验收标准`

7. **改进建议**：使用可执行检查清单格式
   - [ ] P0: 行动 — 目标 — 验收标准
   - [ ] P1: ...

## Datasheet 检索规则
- 允许自动检索元器件 datasheet 并保存到 `uploads/datasheets/`
- 优先级：厂商官网 > 最新可信来源
- 审计元数据：`component_name`、`query_string`、`retrieved_at`、`source_url`、`source_type`、`confidence`、`notes`

## 评审维度（完整清单）
1. 模拟电路：拓扑、偏置、带宽、噪声、相位/增益裕度、温漂、ESD/过压/过流保护
2. 数字电路：时序裕度、上升/下降时间、终端匹配、时钟分布、复位/启动时序、SI 风险
3. 接口与防护：USB/CAN/Ethernet/RS-485 终端匹配、共模抑制、浪涌/ESD/EFT 防护路径
4. 电源与 PI：拓扑选择、环路补偿、纹波/瞬态响应、去耦系统与回流路径、UVLO/OVP/OCP/短路保护
5. PCB/Layout：叠层结构、阻抗控制、参考平面完整性、回流路径、长度匹配、过孔、敏感节点隔离
6. EMC/EMI：环路与共模路径分析、CM/DM 滤波、端口与电缆约束、屏蔽与接地策略
7. 嵌入式软件：启动/复位策略、时序依赖、外设默认状态、异常检测与降级、看门狗、低功耗、日志
8. 热设计：功率分布、热路径、结温估算与裕度、材料/风道/TIM、热点与均衡策略
9. DFM/DFT：工艺与可制造性、测试点密度与覆盖、ICT/JTAG/SWD、故障注入、模块化、版本追溯

## 语气与风格
- 严谨学术、工程直接、专业、自信、简洁、无废话
- 基于事实、标准、计算得出结论，避免模糊表述

## 质量阈值
- 自动接受：置信度 ≥ 0.90
- 人工复核：0.60 ≤ 置信度 < 0.90
- 强制人工复核：置信度 < 0.60
- 关键元件/网络（电源/地/连接器/总线）置信度 < 0.90 时，在"假设与限制"中说明
```

### 4.2 电路图评审（主副模型架构）修订轮提示词（中文）差异点

在首轮提示词基础上增加：

```markdown
## 修订轮评审说明

**这是修订轮评审。** 用户已针对上一轮【评审报告】提出异议或补充信息。请：

1. **仔细分析历史对话**：从 `history` 中提取用户的异议点、补充数据、澄清信息
2. **针对性调整**：重点调整用户异议相关的结论，其他部分保持或微调
3. **输出完整报告**：给出修订后的完整【评审报告】，不要只回复争议点
4. **增加修订摘要**：在【评审报告】后立即增加"## 本轮修订摘要"章节

## 本轮修订摘要格式

| 变更点 | 原结论 | 新结论 | 变更理由 | 依据来源 |
|--------|--------|--------|----------|----------|
| 1. [描述] | [原] | [新] | [理由] | [来源] |
| 2. ... | ... | ... | ... | ... |

**要求**：
- 变更点编号：从 1 开始递增
- 原结论：简述上一轮的结论（50 字以内）
- 新结论：简述本轮的结论（50 字以内）
- 变更理由：说明为何调整（100 字以内）
- 依据来源：引用用户补充信息、新检索的 datasheet、重新计算的结果等

**示例**：

| 变更点 | 原结论 | 新结论 | 变更理由 | 依据来源 |
|--------|--------|--------|----------|----------|
| 1. R3 阻值评估 | 10kΩ 合适 | 建议改为 4.7kΩ | 用户提供实测负载电流 5mA，压降需控制在 0.5V 以内 | 用户补充信息 + 欧姆定律计算 \( V = IR \) |
| 2. EMC 风险等级 | P1（中） | P0（高） | 用户确认需通过 CE 认证，Class B 限值严格 | IEC 61000-4-2 Level 3 + 用户需求文档 |
```

### 4.3 中英文关键指令对照表

| 中文指令 | 英文指令 | 备注 |
|----------|----------|------|
| 以【评审报告】开头 | Start with "【Review Report】" | 保留中文标记符号 |
| 元信息 | Metadata | 章节标题 |
| 摘要 | Summary | 章节标题 |
| 需求与边界 | Requirements and Boundaries | 章节标题 |
| 假设与限制 | Assumptions and Limitations | 小节标题 |
| 关键指标与合规目标 | Key Metrics and Compliance Targets | 章节标题 |
| 原理图与电路分析 | Schematics and Circuit Analysis | 章节标题 |
| 风险清单与优先级 | Risk List and Priorities | 章节标题 |
| 改进建议（可执行检查清单） | Improvement Suggestions (Actionable Checklist) | 章节标题 |
| 推导与计算（可复现） | Derivations and Calculations (Reproducible) | 章节标题 |
| 本轮修订摘要 | Summary of This Revision | 修订轮专用章节 |
| 变更点 | Change Item | 表格列 |
| 原结论 | Original Conclusion | 表格列 |
| 新结论 | New Conclusion | 表格列 |
| 变更理由 | Reason for Change | 表格列 |
| 依据来源 | Source of Evidence | 表格列 |
| 优先级 P0/P1/P2 | Priority P0/P1/P2 | 风险等级 |
| 验收标准 | Acceptance Criteria | 表格列 |
| 严谨学术、工程直接 | Rigorous academic, engineering direct | 语气描述 |
| 快速概览式评审 | Quick overview review | 评审类型 |

## 5. 实施路径

### 5.1 实施清单（27 项）

1. ✅ 创建 PRD 文档 `doc/prd/prompt-optimization-prd.md`
2. 创建目录 `ReviewAIPrompt/circuit-agent/`
3. 生成 `system_prompt_initial_zh.md`
4. 生成 `system_prompt_initial_en.md`
5. 生成 `system_prompt_revision_zh.md`
6. 生成 `system_prompt_revision_en.md`
7. 创建目录 `ReviewAIPrompt/circuit-fine-agent/`
8. 移动 `macro_prompt.md` 到 `circuit-fine-agent/`
9. 移动 `ic_prompt.md` 到 `circuit-fine-agent/`
10. 移动 `rc_prompt.md` 到 `circuit-fine-agent/`
11. 移动 `net_prompt.md` 到 `circuit-fine-agent/`
12. 移动 `verify_prompt.md` 到 `circuit-fine-agent/`
13. 移动 `consolidation_prompt.md` 到 `circuit-fine-agent/`
14. 生成 `circuit-fine-agent/system_prompt_zh.md`
15. 生成 `circuit-fine-agent/system_prompt_en.md`
16. 创建 `services/circuit-agent/src/infra/prompts/PromptLoader.ts`
17. 修改 `services/circuit-agent/src/app/usecases/DirectReviewUseCase.ts`
18. 修改 `services/circuit-agent/src/infra/providers/OpenRouterVisionProvider.ts`
19. 修改 `services/circuit-agent/src/interface/http/routes/directReview.ts`
20. 修改 `services/circuit-agent/src/interface/http/routes/orchestrate.ts`（如适用）
21. 创建 `services/circuit-fine-agent/src/infra/prompts/PromptLoader.ts`
22. 搜索并修改 `circuit-fine-agent` 中旧路径引用
23. 检查并修改前端 language 传递（`frontend/src/components/ReviewForm.tsx`）
24. 更新 `CURSOR.md`
25. 更新 `README.md`
26. 更新 `README.zh.md`
27. 在 PRD 附录添加测试指引与审批清单

### 5.2 依赖关系

- 任务 3-6 依赖任务 2
- 任务 8-13 依赖任务 7
- 任务 17-20 依赖任务 16
- 任务 22 依赖任务 8-13
- 任务 24-26 依赖所有前置任务

### 5.3 风险缓解

| 风险 | 缓解措施 |
|------|----------|
| 文件移动破坏 circuit-fine-agent | 先复制后验证，保留旧文件作为备份 |
| 提示词加载失败导致运行时崩溃 | PromptLoader fail-fast + 服务启动时预检 |
| 中英文语义偏差 | 人工审批 + 关键指令对照表 |
| 修订轮上下文不足 | 提示词中明确要求分析 history |
| 性能下降（每次读文件） | 静态缓存 Map |

## 6. 验收标准

### 6.1 文档完整性
- [x] PRD 包含背景、需求、架构、清单、验收标准
- [ ] CURSOR.md 同步更新提示词管理章节
- [ ] README.md/README.zh.md 同步更新

### 6.2 文件组织
- [ ] 电路图评审（主副模型架构）/电路图評審（委员会架構） 提示詞完全隔離
- [ ] 旧文件已移动到 `circuit-fine-agent/`
- [ ] 新文件已创建在 `circuit-agent/`

### 6.3 语义等效
- [ ] 中英文提示词关键指令对照表通过人工审批
- [ ] 四个单 agent 提示词文件通过审批

### 6.4 运行时加载
- [ ] 服务启动时正确加载对应提示词
- [ ] 缺失文件时立即报错并显示完整路径
- [ ] PromptLoader 静态缓存生效

### 6.5 首轮/修订轮
- [ ] 首轮评审输出【评审报告】，包含完整结构
- [ ] 修订轮评审在报告开头增加"## 本轮修订摘要"
- [ ] 修订摘要包含变更点、原结论、新结论、变更理由、依据来源

### 6.6 语言切换
- [ ] 前端选择中文时返回中文报告
- [ ] 前端选择英文时返回英文报告
- [ ] 报告内容语义等效

### 6.7 无回归
- [ ] 图片上传功能正常
- [ ] 多轮对话功能正常
- [ ] 会话保存/加载功能正常
- [ ] 时间线与工件查看功能正常

## 7. 测试指引（用户执行）

### 7.1 启动验证
1. 启动 `circuit-agent` 服务
2. 检查日志是否正常加载提示词（无报错）

### 7.2 缺失文件测试
1. 重命名 `ReviewAIPrompt/circuit-agent/system_prompt_initial_zh.md` 为 `_system_prompt_initial_zh.md`
2. 重启服务
3. **预期**：服务报错，日志显示完整路径 `ReviewAIPrompt/circuit-agent/system_prompt_initial_zh.md not found`
4. 恢复文件名

### 7.3 首轮评审测试（中文）
1. 前端切换为中文语言
2. 上传测试电路图图片
3. 对话框输入："请评审这个电路的电源部分"
4. 提交评审
5. **预期**：
   - 返回以【评审报告】开头的中文 Markdown 报告
   - 包含完整章节结构（元信息、摘要、需求与边界等）
   - 如信息不足，在"假设与限制"中说明

### 7.4 首轮评审测试（英文）
1. 前端切换为英文语言
2. 上传相同测试电路图
3. 对话框输入："Please review the power section of this circuit"
4. 提交评审
5. **预期**：
   - 返回以【Review Report】开头的英文 Markdown 报告
   - 章节结构与中文版对应（Metadata, Summary, Requirements and Boundaries 等）

### 7.5 修订轮测试（中文）
1. 在首轮评审结果基础上，对话框输入："R3 的阻值评估不对，实测负载电流是 5mA，压降需要控制在 0.5V 以内"
2. 提交修订
3. **预期**：
   - 返回以【评审报告】开头的完整报告
   - 报告开头包含"## 本轮修订摘要"章节
   - 修订摘要表格包含 R3 阻值的变更记录（原结论、新结论、变更理由、依据来源）

### 7.6 修订轮测试（英文）
1. 切换为英文语言
2. 在首轮评审基础上提交异议（英文）
3. **预期**：
   - 返回英文完整报告
   - 包含"## Summary of This Revision"章节

### 7.7 语言切换测试
1. 中文评审后切换为英文，提交修订
2. **预期**：返回英文修订报告
3. 英文评审后切换为中文，提交修订
4. **预期**：返回中文修订报告

### 7.8 多轮对话测试
1. 首轮评审
2. 提交异议 1（修订轮 1）
3. 提交异议 2（修订轮 2）
4. 提交异议 3（修订轮 3）
5. **预期**：每轮均返回完整报告 + 本轮修订摘要，无最大轮数限制

### 7.9 会话保存/恢复测试
1. 首轮评审后保存会话
2. 刷新页面或关闭重开
3. 加载会话
4. 提交修订
5. **预期**：修订轮正常识别历史，返回修订报告

### 7.10 Datasheet 检索测试
1. 上传包含特定 IC 的电路图（例如 STM32F407）
2. 提交评审
3. **预期**：
   - 报告中引用该 IC 的参数时附带 `source_url` 与 `retrieved_at`
   - `uploads/datasheets/` 目录下生成对应文件（如 `STM32F407_20251001T120000_abc123.pdf`）

## 8. 附录

### 8.1 关键文件清单

**新建文件：**
- `doc/prd/prompt-optimization-prd.md`
- `ReviewAIPrompt/circuit-agent/system_prompt_initial_zh.md`
- `ReviewAIPrompt/circuit-agent/system_prompt_initial_en.md`
- `ReviewAIPrompt/circuit-agent/system_prompt_revision_zh.md`
- `ReviewAIPrompt/circuit-agent/system_prompt_revision_en.md`
- `ReviewAIPrompt/circuit-fine-agent/system_prompt_zh.md`
- `ReviewAIPrompt/circuit-fine-agent/system_prompt_en.md`
- `services/circuit-agent/src/infra/prompts/PromptLoader.ts`
- `services/circuit-fine-agent/src/infra/prompts/PromptLoader.ts`

**移动文件（从 `ReviewAIPrompt/` 到 `ReviewAIPrompt/circuit-fine-agent/`）：**
- `macro_prompt.md`
- `ic_prompt.md`
- `rc_prompt.md`
- `net_prompt.md`
- `verify_prompt.md`
- `consolidation_prompt.md`

**修改文件：**
- `services/circuit-agent/src/app/usecases/DirectReviewUseCase.ts`
- `services/circuit-agent/src/infra/providers/OpenRouterVisionProvider.ts`
- `services/circuit-agent/src/interface/http/routes/directReview.ts`
- `services/circuit-agent/src/interface/http/routes/orchestrate.ts`
- `services/circuit-fine-agent/src/[对应文件]`（根据搜索结果）
- `frontend/src/components/ReviewForm.tsx`（如需要）
- `CURSOR.md`
- `README.md`
- `README.zh.md`

### 8.2 审批清单（由用户执行）

- [ ] PRD 内容审批通过
- [ ] 电路图评审（主副模型架构）首轮提示词（中文）审批通过
- [ ] 电路图评审（主副模型架构）首轮提示词（英文）审批通过，与中文语义等效
- [ ] 电路图评审（主副模型架构）修订轮提示词（中文）审批通过
- [ ] 电路图评审（主副模型架构）修订轮提示词（英文）审批通过，与中文语义等效
- [ ] 电路图评审（委员会架构）系统提示词（中文）审批通过
- [ ] 电路图评审（委员会架构）系统提示词（英文）审批通过，与中文语义等效
- [ ] 代码改造审批通过
- [ ] 测试验证通过（7.1-7.10）
- [ ] 文档更新审批通过

## 9. 变更记录

| 日期 | 版本 | 作者 | 摘要 |
|------|------|------|------|
| 2025-10-01 | v1.0 | AI 助手（GPT-5 Mini） | 初始创建 PRD |

