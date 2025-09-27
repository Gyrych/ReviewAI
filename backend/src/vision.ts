import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import https from 'https'
import { webSearch } from './search'
import crypto from 'crypto'
import { logInfo, logError, logWarn } from './logger'
import { pushProgress } from './progress'
import { makeTimelineItem } from './timeline'
import sharp from 'sharp'

// 中文注释：多轮视觉识别和结果整合系统
// 支持对同一图片进行多次识别，然后通过大模型整合结果，提高识别准确性

/**
 * 从图片中提取电路JSON的主函数
 * 支持单轮和多轮识别模式
 */
export async function extractCircuitJsonFromImages(
  images: { path: string; originalname: string }[],
  apiUrl: string,
  model: string,
  authHeader?: string,
  options?: {
    enableSearch?: boolean;
    enableParamEnrich?: boolean;
    topN?: number;
    saveEnriched?: boolean;
    multiPassRecognition?: boolean;
    recognitionPasses?: number;
    progressId?: string;
  },
  timeline?: { step: string; ts: number; meta?: any }[]
): Promise<any> {
  if (!apiUrl) {
    throw new Error('apiUrl missing for vision extraction')
  }

  const enableSearch = options?.enableSearch !== false
  // 控制是否对每个参数逐项进行联网补充（默认关闭）
  const enableParamEnrich = options?.enableParamEnrich === true || (process.env.ENABLE_PARAM_ENRICH === 'true')
  const topN = options?.topN || Number(process.env.SEARCH_TOPN) || 5
  const saveEnriched = options?.saveEnriched !== false
  const multiPassRecognition = options?.multiPassRecognition === true;
  const recognitionPasses = Math.max(1, Math.min(options?.recognitionPasses || 5, 10)) // 限制在1-10次之间
  const progressId = (options && (options as any).progressId) ? String((options as any).progressId) : ''

  logInfo('vision.extraction_start', {
    imageCount: images.length,
    multiPassEnabled: multiPassRecognition,
    recognitionPasses: multiPassRecognition ? recognitionPasses : 1,
    apiUrl: apiUrl.split('/').pop(), // 只记录域名部分
    model,
    enableSearch,
    topN,
    saveEnriched
  })

  // 统计信息收集
  const processingStats = {
    totalImages: images.length,
    successfulRecognitions: 0,
    failedRecognitions: 0,
    totalComponents: 0,
    totalConnections: 0,
    processingTime: 0
  }

  // 初始化IC器件资料元数据
  let datasheetMeta: any[] = []

  const tStart = Date.now()
  const combined: any = { components: [], connections: [] }

  // 处理每张图片
  for (const img of images) {
    try {
      logInfo('vision.processing_image', { filename: img.originalname })

      let recognitionResults: any[] = []

      if (multiPassRecognition) {
        // 多轮识别模式
        recognitionResults = await doMultiPassRecognition(img, apiUrl, model, authHeader, recognitionPasses, timeline)
      } else {
        // 单轮识别模式
        const result = await recognizeSingleImage(img, apiUrl, model, authHeader)
        recognitionResults = [result]
      }

      // 如果有多轮结果，进行整合
      let finalResult: any
      if (recognitionResults.length > 1) {
        finalResult = await consolidateRecognitionResults(recognitionResults, apiUrl, model, authHeader, timeline)
      } else {
        finalResult = recognitionResults[0]
      }

      // 合并到总结果中
      if (finalResult.components && Array.isArray(finalResult.components)) {
        combined.components.push(...finalResult.components)
      }
      if (finalResult.connections && Array.isArray(finalResult.connections)) {
        combined.connections.push(...finalResult.connections)
      }

      // 更新统计信息
      processingStats.successfulRecognitions++
      processingStats.totalComponents += finalResult.components?.length || 0
      processingStats.totalConnections += finalResult.connections?.length || 0

      logInfo('vision.image_processed', {
        filename: img.originalname,
        recognitionPasses: recognitionResults.length,
        finalComponents: finalResult.components?.length || 0,
        finalConnections: finalResult.connections?.length || 0,
        componentsWithLabels: finalResult.components?.filter((c: any) => c.label && c.label.trim()).length || 0
      })

    } catch (e) {
      processingStats.failedRecognitions++

      logError('vision.image_processing_failed', {
        filename: img.originalname,
        error: String(e),
        errorType: e instanceof Error ? e.constructor.name : 'Unknown'
      })
      // 继续处理其他图片，不中断整个流程
    }
  }

  // 参数级别的联网补充（parameter enrichment）已从项目中移除。
  // 为保持接口兼容性，不再对组件参数进行网络补充，也不会将相关 enrichment 的 timeline 条目写入历史。
  // 任何原有的 enrichment 逻辑已被移除以简化流程并降低外部依赖。

  // 集成OCR辅助识别
  let ocrResults: any[] = []
  try {
    logInfo('vision.ocr.start', { imageCount: images.length, enableOCR: true })

    // 记录OCR开始到timeline
    if (timeline) {
      const it = makeTimelineItem('vision.ocr_start', { ts: Date.now(), origin: 'backend', category: 'vision', meta: { type: 'vision_ocr', imageCount: images.length, description: `开始OCR辅助识别，共处理${images.length}张图片` } })
      timeline.push(it)
      try { if (progressId) pushProgress(progressId, it) } catch {}
    }

    // 对每张图片并行进行OCR识别
    const ocrPromises = images.map(async (img) => {
      try {
        const ocrResult = await performOCRRecognition(img.path)
        logInfo('vision.ocr.image_completed', {
          filename: img.originalname,
          ocrSuccess: ocrResult.success,
          extractedComponents: ocrResult.extractedComponents?.length || 0,
          extractedValues: ocrResult.extractedValues?.length || 0
        })
        return ocrResult
      } catch (error) {
        logError('vision.ocr.image_failed', {
          filename: img.originalname,
          error: String(error)
        })
        return { success: false, extractedComponents: [], extractedValues: [] }
      }
    })

    ocrResults = await Promise.all(ocrPromises)

    // 合并所有OCR结果
    const mergedOCRResult = {
      success: true,
      extractedComponents: ocrResults.flatMap(r => r.extractedComponents || []),
      extractedValues: ocrResults.flatMap(r => r.extractedValues || []),
      ocrStats: {
        totalImages: images.length,
        successfulOCRs: ocrResults.filter(r => r.success).length,
        totalExtractedComponents: ocrResults.reduce((sum, r) => sum + (r.extractedComponents?.length || 0), 0),
        totalExtractedValues: ocrResults.reduce((sum, r) => sum + (r.extractedValues?.length || 0), 0)
      }
    }

    // 将OCR结果与大模型结果融合
    combined.components = fuseVisionAndOCRResults(combined.components || [], mergedOCRResult)

    logInfo('vision.ocr.fusion_completed', mergedOCRResult.ocrStats)

    // 记录OCR融合完成到timeline（并尝试附上预处理图像与提取文本/词位 artifacts）
    if (timeline) {
      const it: any = {
        step: 'ocr_recognition_done',
        ts: Date.now(),
        meta: {
          type: 'vision_ocr',
          ...mergedOCRResult.ocrStats,
          description: `OCR辅助识别完成，提取${mergedOCRResult.ocrStats.totalExtractedComponents}个元件，${mergedOCRResult.ocrStats.totalExtractedValues}个数值`,
          ocrDetails: {
            extractedComponents: mergedOCRResult.extractedComponents,
            extractedValues: mergedOCRResult.extractedValues,
            imageDetails: ocrResults.map((result, index) => ({
              imageIndex: index,
              filename: images[index]?.originalname || `image_${index + 1}`,
              success: result.success,
              confidence: result.confidence,
              textLength: result.text?.length || 0,
              extractedComponentsCount: result.extractedComponents?.length || 0,
              extractedValuesCount: result.extractedValues?.length || 0,
              textPreview: result.text?.substring(0, 200) + (result.text?.length > 200 ? '...' : ''),
              languages: result.languages
            }))
          }
        }
      }
      try {
        const { saveArtifact } = require('./artifacts')
        const txtA = await saveArtifact((ocrResults.map(r => r.text || '').join('\n\n')).slice(0) || '', `ocr_text_${Date.now()}`, { ext: '.txt', contentType: 'text/plain' })
        it.meta.ocrTextArtifact = txtA
        try {
          const wordsCombined = JSON.stringify(ocrResults.map(r => r.words || []), null, 2)
          const wordsA = await saveArtifact(wordsCombined, `ocr_words_${Date.now()}`, { ext: '.json', contentType: 'application/json' })
          it.meta.ocrWordsArtifact = wordsA
        } catch {}
        // 如果先前保存了预处理图像 artifact，将其附加
        if ((global as any).__ocr_preprocess_last__) {
          it.meta.preprocessedImageArtifact = (global as any).__ocr_preprocess_last__
          delete (global as any).__ocr_preprocess_last__
        }
      } catch {}
      // 将原有 it.meta 中的 artifact 字段移入 artifacts 以匹配统一 schema
      try {
        const artifacts: any = {}
        if (it.meta && it.meta.ocrTextArtifact) { artifacts.ocrText = it.meta.ocrTextArtifact; delete it.meta.ocrTextArtifact }
        if (it.meta && it.meta.ocrWordsArtifact) { artifacts.ocrWords = it.meta.ocrWordsArtifact; delete it.meta.ocrWordsArtifact }
        if (it.meta && it.meta.preprocessedImageArtifact) { artifacts.preprocessedImage = it.meta.preprocessedImageArtifact; delete it.meta.preprocessedImageArtifact }
        const newIt = makeTimelineItem('vision.ocr_done', { ts: it.ts || Date.now(), origin: 'backend', category: 'vision', meta: it.meta, artifacts })
        timeline.push(newIt)
        try { if (progressId) pushProgress(progressId, newIt) } catch {}
      } catch {
        timeline.push(it)
        try { if (progressId) pushProgress(progressId, it) } catch {}
      }
    }

    // 将OCR结果添加到metadata中
    if (!combined.metadata) combined.metadata = {}
    combined.metadata.ocrResult = mergedOCRResult

  } catch (error) {
    logError('vision.ocr.integration_failed', {
      error: String(error),
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined
    })

    // 记录OCR失败到timeline
    if (timeline) {
      const it = { step: 'ocr_recognition_failed', ts: Date.now(), meta: { type: 'vision_ocr', error: String(error), description: 'OCR辅助识别失败，继续使用大模型识别结果' } }
      timeline.push(it)
      try { if (progressId) pushProgress(progressId, it) } catch {}
    }

    // OCR失败不影响主流程继续
  }

  // 应用后处理校正
  const correctionResult = applyPostProcessingCorrection(combined.components || [], combined.connections || [])
  combined.components = correctionResult.components

  // 将验证结果添加到metadata中
  if (!combined.metadata) combined.metadata = {}
  combined.metadata.validationResult = correctionResult.validation

  // 规范化为 circuit-schema：connections -> nets，补齐 metadata/uncertainties
  const normalized = normalizeToCircuitSchema(combined, images, tStart)

  // 强制：对IC类器件进行资料检索并落盘（uploads/datasheets/）
  if (timeline) {
    const it = { step: 'ic_datasheet_fetch_start', ts: Date.now(), meta: { type: 'backend', description: '开始为IC器件下载datasheet资料' } }
    timeline.push(it)
    try { if (progressId) pushProgress(progressId, it) } catch {}
  }

  try {
    datasheetMeta = await fetchAndSaveDatasheetsForICComponents(normalized.components, topN)
  } catch (e) {
    logError('vision.datasheets.save.failed', { error: String(e) })
  }

  // 记录IC资料下载完成
  if (timeline) {
    const icCount = normalized.components?.filter((c: any) => {
      const t = (c?.type || '').toString().toLowerCase()
      return t.includes('ic') || t.includes('chip') || t.includes('opamp') || t.includes('op-amp')
    }).length || 0

    const it = { step: 'ic_datasheet_fetch_done', ts: Date.now(), meta: { type: 'backend', icComponentsCount: icCount, datasheetsDownloaded: datasheetMeta.length, datasheetCount: datasheetMeta.length, downloadedCount: datasheetMeta.filter((item: any) => item.notes && item.notes.includes('saved:')).length, datasheets: datasheetMeta, description: `IC器件资料下载完成，识别出${icCount}个IC器件，下载${datasheetMeta.length}份资料` } }
    timeline.push(it)
    try { if (progressId) pushProgress(progressId, it) } catch {}
  }

  // 将资料元数据添加到 normalized 对象中，以便返回给前端
  normalized.datasheetMeta = datasheetMeta

  // 移除参数补充策略：为兼容保留字段但写入默认已禁用状态
  normalized.enrichmentPolicy = {
    enableSearch: !!enableSearch,
    enableParamEnrich: false,
    saveEnriched: false
  }

  // Optionally save enriched JSON to uploads for auditing（命名与路径统一）
  if (saveEnriched) {
    try {
      const uploadsDir = path.join(__dirname, '..', 'uploads')
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
      const tsIso = new Date().toISOString()
      const tsName = tsIso.replace(/[:]/g, '-').replace(/\..+$/, 'Z')
      const fname = `enriched_${tsName}.json`
      const outPath = path.join(uploadsDir, fname)
      fs.writeFileSync(outPath, JSON.stringify(normalized, null, 2), { encoding: 'utf8' })
      logInfo('vision.enriched.saved', { path: outPath })

      // 推荐项：若 overlay 存在，额外保存 overlay 文件并登记日志
      if ((normalized as any).overlay && (normalized as any).overlay.svg) {
        const svgPath = path.join(uploadsDir, `overlay_${tsName.replace(/[-:]/g, '').replace('T', '_').slice(0, 15)}.svg`)
        try { fs.writeFileSync(svgPath, String((normalized as any).overlay.svg), { encoding: 'utf8' }) } catch {}
        if ((normalized as any).overlay.mapping) {
          const mapPath = path.join(uploadsDir, `overlay_${tsName.replace(/[-:]/g, '').replace('T', '_').slice(0, 15)}.json`)
          try { fs.writeFileSync(mapPath, JSON.stringify((normalized as any).overlay.mapping, null, 2), { encoding: 'utf8' }) } catch {}
        }
      }
    } catch (e) {
      logError('vision.enriched.save.failed', { error: String(e) })
    }
  }

  // 计算最终处理时间
  const tEnd = Date.now()
  processingStats.processingTime = tEnd - tStart

  // 记录最终统计信息
  logInfo('vision.extraction_complete', {
    ...processingStats,
    successRate: processingStats.totalImages > 0 ? (processingStats.successfulRecognitions / processingStats.totalImages * 100).toFixed(1) + '%' : '0%',
    averageComponentsPerImage: processingStats.successfulRecognitions > 0 ? (processingStats.totalComponents / processingStats.successfulRecognitions).toFixed(1) : '0',
    averageConnectionsPerImage: processingStats.successfulRecognitions > 0 ? (processingStats.totalConnections / processingStats.successfulRecognitions).toFixed(1) : '0',
    totalProcessingTimeMs: processingStats.processingTime,
    averageProcessingTimePerImage: processingStats.totalImages > 0 ? Math.round(processingStats.processingTime / processingStats.totalImages) + 'ms' : '0ms'
  })

  return normalized
}

// ========================================
// 专业电子元件识别提示词生成
// ========================================

/**
 * 根据识别阶段生成专业的电子元件识别prompt
 * @param passNumber 当前识别轮次 (1-based)
 * @param totalPasses 总识别轮次
 * @returns 专业的识别prompt
 */
function generateSpecializedPrompt(passNumber: number, totalPasses: number): string {
  // 固定五步流水线：1=macro, 2=IC, 3=RC, 4=net-trace, 5=validation
  // 当后端以固定流程运行时（5 步），直接按照下面映射返回对应 prompt
  if (passNumber === 1) return generateMacroRecognitionPrompt()
  if (passNumber === 2) return generateICSpecializedPrompt()
  if (passNumber === 3) return generateResistorCapacitorSpecializedPrompt()
  if (passNumber === 4) return generateNetTracingPrompt()
  if (passNumber === totalPasses) return generateDetailedVerificationPrompt()

  // 兜底：如果出现非预期轮次，返回通用识别prompt
  return generateGeneralRecognitionPrompt()
}

/**
 * 宏观识别prompt：快速识别元件位置和基本类型
 */
function generateMacroRecognitionPrompt(): string {
  return `Analyze this circuit schematic image and identify all electronic components. Focus on:

1. COMPONENT LOCATION AND BASIC TYPES:
   - Resistors (R1, R2, etc.) - rectangular with value markings
   - Capacitors (C1, C2, etc.) - various shapes with capacitance markings
   - Inductors (L1, L2, etc.) - coil symbols
   - ICs/Chips (U1, U2, etc.) - rectangular with many pins
   - Transistors (Q1, Q2, etc.) - transistor symbols
   - Diodes (D1, D2, etc.) - diode symbols
   - Connectors (J1, J2, etc.) - connector symbols

2. BASIC IDENTIFICATION:
   - Reference designators (R1, C1, U1, etc.)
   - Component shapes and symbols
   - Approximate positions on the schematic

3. CONNECTION PATTERNS:
   - Wire connections between components
   - Net names if visible
   - Power and ground connections

Return JSON with "components" and "connections" keys. For this first pass, focus on quantity and locations rather than exact values.`
}

/**
 * IC芯片专项识别prompt：重点识别IC型号和引脚信息
 */
function generateICSpecializedPrompt(): string {
  return `SPECIALIZED IC CHIP RECOGNITION - Focus on Integrated Circuits:

CRITICAL: IC model numbers are often small text near the chip. Look carefully for manufacturer prefixes and model numbers.

1. IC IDENTIFICATION PATTERNS:
   - Manufacturer Prefixes: STM32, ATMEGA, LM358, AD8xx, MAX4xx, PIC, AVR, MSP430, ESP32
   - Common Formats: [PREFIX][NUMBER][SUFFIX] (e.g., STM32F407, AD8606, LM358N)
   - Package Types: SOIC, DIP, QFN, BGA, TSSOP, etc.

2. CHARACTER RECOGNITION CORRECTIONS:
   - 1 ↔ I ↔ l (ones, capital I, lowercase L)
   - 0 ↔ O ↔ o (zero, capital O, lowercase o)
   - 5 ↔ S (five, capital S)
   - 8 ↔ B (eight, capital B)
   - Common mistakes: "1KO" should be "1KΩ", "AD8O6" should be "AD806"

3. PIN INFORMATION:
   - Pin count (8, 14, 16, 28, 32, 64, etc.)
   - Pin numbering (1, 2, 3... usually starting from bottom-left)
   - Pin functions if labeled (VCC, GND, IN+, IN-, etc.)

4. VALIDATION RULES:
   - IC reference designators typically start with U, IC, or sometimes Q for some chips
   - Model numbers usually contain both letters and numbers
   - Check for reasonable pin counts based on package type

Focus on reading ALL small text labels around IC chips. Return JSON with precise IC model numbers.`
}

/**
 * 阻容元件专项识别prompt：重点识别阻值和容值
 */
function generateResistorCapacitorSpecializedPrompt(): string {
  return `SPECIALIZED RESISTOR & CAPACITOR RECOGNITION - Focus on component values:

CRITICAL: Component values are often small text markings. Pay special attention to units and multipliers.

1. RESISTOR VALUE PATTERNS:
   - Units: Ω (ohm), kΩ, MΩ, R (sometimes used for ohm)
   - Common formats: "1k", "10k", "100", "1M", "470R", "2.2kΩ"
   - Tolerance markings: ±5%, ±1%, F, G, J, K (sometimes after value)
   - Color codes (if visible): bands indicating value and tolerance

2. CAPACITOR VALUE PATTERNS:
   - Units: pF, nF, µF, uF, mF
   - Common formats: "10nF", "100uF", "0.1uF", "1uF", "10pF"
   - Voltage ratings: sometimes marked (16V, 25V, 50V, etc.)
   - Types: ceramic, electrolytic, tantalum (different symbols)

3. CHARACTER RECOGNITION CORRECTIONS:
   - Ω (omega) symbol vs "OHM" text
   - µ (micro) vs "u" abbreviation
   - k (kilo) vs "K" (watch for case)
   - Decimal points: "2.2" vs "22" (context matters)
   - Multipliers: "2k2" = 2.2kΩ, "4u7" = 4.7µF

4. VALIDATION RULES:
   - Resistor values: typically 1Ω to 10MΩ range
   - Capacitor values: typically 1pF to 10000µF range
   - Reference designators: R for resistors, C for capacitors

Look for value markings near component symbols. Use engineering judgment for ambiguous readings.`
}

/**
 * 精细化验证prompt：综合验证和完善信息
 */
function generateDetailedVerificationPrompt(): string {
  return `DETAILED VERIFICATION PASS - Validation + Explanation (final pass):

This pass MUST act as a validator and explain the reasoning for each change or decision.

1. FOR EACH COMPONENT AND CONNECTION, OUTPUT A DECISION ENTRY WITH:
   - entityId: component id or connection id
   - entityType: "component" | "connection"
   - field: the field being decided (e.g., "label", "pins", "connection")
   - originalValue: value as seen in previous passes (if any)
   - finalValue: value after this pass (may be same as original)
   - sourcePasses: array of pass numbers used as evidence (e.g., [2,3])
   - decisionReason: short explanation why this value was accepted/changed
   - confidence: 0.0 - 1.0
   - action: one of ["accept", "modify", "remove", "defer_to_human"]

2. CONFLICTS & UNCERTAINTIES:
   - For any conflicting observations across passes, include a 'conflicts[]' entry describing the conflict, involved passes, and a recommended action (e.g., "choose_most_common", "human_review").

3. VERIFICATION RULES (apply strict engineering checks):
   - Verify IC models against known patterns and common manufacturers
   - Ensure numeric values fall within reasonable engineering ranges
   - Validate pin counts vs package types
  - For any automated correction, include 'originalValue' and 'decisionReason'

4. OUTPUT FORMAT (MANDATORY):
Return a single JSON object with these keys:
  - "components": array
  - "connections": array
  - "decisions": array of decision entries (see above)
  - "conflicts": array of conflict descriptors
  - "uncertainties": array (items requiring human review)
  - "metadata": object (include model_version, inference_time_ms)

Example decision item:
{
  "entityId": "R1",
  "entityType": "component",
  "field": "label",
  "originalValue": "1KO",
  "finalValue": "1kΩ",
  "sourcePasses": [3],
  "decisionReason": "unit normalization and common OCR error 0->O",
  "confidence": 0.92,
  "action": "modify"
}

Use previous passes as evidence. Focus on producing a machine-readable audit trail (decisions) that explains every modification.`
}

/**
 * Net-tracing / connection-disambiguation prompt：用于第4轮
 * 要求模型列出每个 net 的候选路径、可能的歧义以及每条连接的置信度
 */
function generateNetTracingPrompt(): string {
  return `NET-TRACING AND CONNECTION DISAMBIGUATION PASS - Analyze wiring and nets in detail:

1. FOR EACH NET (group of connected pins), LIST:
   - net_id (if available) or generate temporary id
   - connected_pins: list of { componentId, pin }
   - candidate_paths: array of candidate trace descriptions when ambiguous
   - confidence: 0.0 - 1.0

2. CONNECTION DISAMBIGUATION:
   - Where multiple possible connections exist, list all candidates with short justification and confidence
   - Indicate overlapping wires, vias, or ambiguous junctions and explain why ambiguous

3. PRIORITY RULES:
   - Prefer connections that appear in multiple previous passes
   - Prefer direct wire continuity over inferred connections via labels unless strongly supported
   - Mark power and ground nets explicitly when identified

4. OUTPUT FORMAT:
Return JSON with keys: components (optional updates), connections, nets, ambiguities.
Each net should include candidate_paths and confidence. Each ambiguity should include a short reason and recommended action (e.g., 'human_review', 'choose_most_common').

Example:
{
  "nets": [{ "net_id": "N1", "connected_pins": ["U1.1","R1.1"], "candidate_paths": [{"path":"direct","confidence":0.9}], "confidence":0.9}],
  "ambiguities": [{"net_id":"N2","reason":"overlapping traces at junction","candidates":[...],"recommendation":"human_review"}]
}

Focus on enumerating ambiguous cases clearly so the final consolidation can make informed decisions.`
}

/**
 * 通用识别prompt：适用于中间轮次或默认情况
 */
function generateGeneralRecognitionPrompt(): string {
  const promptPath = path.join(__dirname, '..', '..', 'ReviewAIPrompt', 'single_pass_vision_prompt.md')
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Required prompt file missing: ${promptPath}`)
  }
  const txt = fs.readFileSync(promptPath, { encoding: 'utf8' })
  if (!txt || !txt.trim()) {
    throw new Error(`Required prompt file is empty: ${promptPath}`)
  }
  return txt
}

// ========================================
// 后处理验证和校正系统
// ========================================

/**
 * 字符识别校正映射表 - 增强版，支持中英文混淆
 */
const CHARACTER_CORRECTIONS: { [key: string]: string[] } = {
  // 数字字符混淆
  '0': ['O', 'o', '零'],
  '1': ['I', 'l', 'i', '一'],
  '2': ['Z', '二'],
  '3': ['E', '三'],
  '4': ['A', '四'],
  '5': ['S', 's', '五'],
  '6': ['G', 'b', '六'],
  '7': ['T', 'Y', '七'],
  '8': ['B', 'b', '八'],
  '9': ['g', 'q', '九'],

  // 字母字符混淆
  'A': ['4'],
  'B': ['8', '6'],
  'C': ['(', '[', '©'],
  'D': ['0', 'O'],
  'E': ['3'],
  'F': ['7'],
  'G': ['6', '9'],
  'H': ['4', '11'],
  'I': ['1', '|'],
  'J': ['7'],
  'K': ['4', 'X'],
  'L': ['1', '|'],
  'O': ['0', 'o'],
  'P': ['9'],
  'Q': ['9', '0'],
  'R': ['2'],
  'S': ['5', '8'],
  'T': ['7', '+'],
  'U': ['V', 'v'],
  'V': ['U', 'u'],
  'W': ['VV', 'vv'],
  'X': ['x'],
  'Y': ['7', '4'],
  'Z': ['2', '7'],

  // 特殊符号
  'Ω': ['OHM', 'ohm', 'R', 'r', '欧', '欧姆'],
  'µ': ['u', 'U', 'μ'],
  'μ': ['u', 'U', 'µ'],
  '°': ['deg', 'DEG'],
  '±': ['+/-', '+/-'],
  '×': ['x', '*'],
  '÷': ['/'],

  // 中文数字单位校正
  'k': ['千', 'K'],
  'M': ['兆'],
  // 移除重复键 'µ'，合并含义到上方字符映射
  'n': ['纳'],
  'p': ['皮'],
  'm': ['毫'],
  // 移除重复键 'Ω'，避免与上方特殊符号重复
  // 移除与字母混淆表重复的键：F/H/V/A/W
  'Hz': ['赫'],

  // 电路元件中文名称校正（支持简繁体）
  // 移除与字母混淆表重复的键：R/C/L/D/Q/U
  'IC': ['芯片', '晶片', '集成电路', '積體電路'],
  'GND': ['地'],
  'VCC': ['电源', '電源'],
  'VDD': ['电源', '電源'],
  'SW': ['开关', '開關'],
  'VR': ['电位器', '電位器'],
  // 单字符 'T' 与字母混淆表重复，移除
}

/**
 * 常见IC型号映射表
 */
const COMMON_IC_MODELS: { [key: string]: string[] } = {
  // 运算放大器
  'AD825': ['AD825', 'AD82S', 'AD8Z5'],
  'LM358': ['LM358', 'LM35B', 'LMS58', 'LM3S8'],
  'TL071': ['TL071', 'TLO71', 'T1071'],
  'TL072': ['TL072', 'TLO72'],
  'OP07': ['OP07', '0P07'],
  'AD620': ['AD620', 'AD62O'],
  'INA126': ['INA126', 'INA12G'],

  // 微控制器
  'STM32F4': ['STM32F4', 'STMS2F4'],
  'STM32F1': ['STM32F1', 'STMS2F1'],
  'ATMEGA328': ['ATMEGA328', 'ATME6A328'],
  'ATMEGA2560': ['ATMEGA2560', 'ATME6A2560'],
  'PIC16F877A': ['PIC16F877A'],
  'PIC18F4550': ['PIC18F4550'],

  // 数字芯片
  '74HC595': ['74HC595', '74HCS9S'],
  '74HC165': ['74HC165', '74HC16S'],
  'CD4051': ['CD4051', 'CD40S1'],
  'MAX7219': ['MAX7219'],
  'DS1307': ['DS1307'],

  // 电源管理
  'LM7805': ['LM7805', 'LM78O5'],
  'LM317': ['LM317'],
  'AMS1117': ['AMS1117'],
  'MP2307': ['MP2307'],
}

/**
 * 校正字符串中的字符识别错误 - 增强版，支持中英文混合
 * @param text 输入文本
 * @returns 校正后的文本
 */
function correctCharacterRecognition(text: string): string {
  if (!text || typeof text !== 'string') return text

  let corrected = text

  // 首先处理中文数字到阿拉伯数字的转换
  const chineseNumbers: { [key: string]: string } = {
    '零': '0', '一': '1', '二': '2', '三': '3', '四': '4',
    '五': '5', '六': '6', '七': '7', '八': '8', '九': '9',
    '十': '10'
  }

  for (const [chinese, arabic] of Object.entries(chineseNumbers)) {
    corrected = corrected.replace(new RegExp(chinese, 'g'), arabic)
  }

  // 应用字符校正映射（保持原始大小写以避免破坏中文）
  for (const [correct, alternatives] of Object.entries(CHARACTER_CORRECTIONS)) {
    for (const alt of alternatives) {
      // 对于中文字符，使用更精确的匹配
      if (/[\u4e00-\u9fff]/.test(alt)) {
        // 中文字符：精确匹配
        corrected = corrected.replace(new RegExp(alt, 'g'), correct)
      } else {
        // 英文和符号：词边界匹配，避免破坏中文
        // 对特殊正则表达式字符进行转义
        const escapedAlt = alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp(`\\b${escapedAlt}\\b`, 'gi')
        corrected = corrected.replace(regex, correct)
      }
    }
  }

  // 特殊处理：统一单位格式（支持简繁体）
  const unitMappings = [
    { patterns: ['OHM', 'ohm', '欧', '歐', '欧姆', '歐姆'], replacement: 'Ω' },
    { patterns: ['MICRO', '微'], replacement: 'µ' },
    { patterns: ['KILO', '千'], replacement: 'k' },
    { patterns: ['MEGA', '兆'], replacement: 'M' },
    { patterns: ['NANO', '纳', '納'], replacement: 'n' },
    { patterns: ['PICO', '皮'], replacement: 'p' },
    { patterns: ['MILLI', '毫'], replacement: 'm' },
    { patterns: ['FARAD', '法', '法拉'], replacement: 'F' },
    { patterns: ['HENRY', '亨', '亨利'], replacement: 'H' },
    { patterns: ['VOLT', '伏'], replacement: 'V' },
    { patterns: ['AMP', '安'], replacement: 'A' },
    { patterns: ['WATT', '瓦'], replacement: 'W' },
    { patterns: ['HERTZ', '赫'], replacement: 'Hz' },
    { patterns: ['KHZ', '千赫'], replacement: 'kHz' },
    { patterns: ['MHZ', '兆赫'], replacement: 'MHz' },
    { patterns: ['GHZ', '吉赫'], replacement: 'GHz' }
  ]

  unitMappings.forEach(({ patterns, replacement }) => {
    patterns.forEach(pattern => {
      const regex = new RegExp(`\\b${pattern}\\b`, 'gi')
      corrected = corrected.replace(regex, replacement)
    })
  })

  return corrected
}

/**
 * 验证和校正IC型号
 * @param model 识别出的IC型号
 * @returns 校正后的型号或null（如果无法校正）
 */
function validateAndCorrectICModel(model: string): string | null {
  if (!model || typeof model !== 'string') return null

  const corrected = correctCharacterRecognition(model)

  // 检查是否匹配已知IC型号
  for (const [standard, variants] of Object.entries(COMMON_IC_MODELS)) {
    if (variants.some(variant => {
      // 精确匹配
      if (corrected === variant) return true
      // 包含匹配
      if (corrected.includes(variant) || variant.includes(corrected)) return true
      // 编辑距离匹配（容忍2个字符的差异）
      if (levenshteinDistance(corrected, variant) <= 2) return true
      return false
    })) {
      return standard
    }
  }

  // 尝试模糊匹配：查找相似的已知型号
  const bestMatch = findBestICModelMatch(corrected)
  if (bestMatch) {
    return bestMatch
  }

  // 如果不匹配已知型号，但符合IC型号格式，也接受
  if (/^[A-Z]{2,6}\d{1,4}[A-Z0-9]*$/.test(corrected) && corrected.length >= 4) {
    return corrected
  }

  // 如果完全不符合IC型号格式，返回null
  return null
}

/**
 * 查找最相似的IC型号
 * @param input 输入的型号字符串
 * @returns 最相似的标准型号或null
 */
function findBestICModelMatch(input: string): string | null {
  let bestMatch = null
  let bestDistance = Infinity

  for (const [standard, variants] of Object.entries(COMMON_IC_MODELS)) {
    for (const variant of variants) {
      const distance = levenshteinDistance(input, variant)
      if (distance < bestDistance && distance <= 3) { // 最多容忍3个字符差异
        bestDistance = distance
        bestMatch = standard
      }
    }
  }

  return bestMatch
}

/**
 * 验证和校正阻值
 * @param value 识别出的阻值
 * @returns 校正后的阻值或null
 */
function validateAndCorrectResistance(value: string): string | null {
  if (!value || typeof value !== 'string') return null

  const corrected = correctCharacterRecognition(value)

  // 提取数值和单位
  const resistancePattern = /^(\d+(?:\.\d+)?)\s*(k|m|μ|u|µ|Ω|ohm|ohms|r)?$/i
  const match = corrected.match(resistancePattern)

  if (!match) return null

  const [, numericPart, unit] = match
  const numValue = parseFloat(numericPart)

  // 验证数值范围（1Ω 到 10MΩ）
  if (numValue < 1 || numValue > 10000000) return null

  // 标准化单位
  let standardUnit = 'Ω'
  if (unit) {
    const unitLower = unit.toLowerCase()
    if (unitLower === 'k') standardUnit = 'kΩ'
    else if (unitLower === 'm') standardUnit = 'MΩ'
    else if (unitLower.includes('μ') || unitLower.includes('u')) standardUnit = 'Ω' // 微欧姆不常见，可能是错误
    else if (unitLower.includes('r')) standardUnit = 'Ω'
  }

  return `${numValue}${standardUnit}`
}

/**
 * 验证和校正容值
 * @param value 识别出的容值
 * @returns 校正后的容值或null
 */
function validateAndCorrectCapacitance(value: string): string | null {
  if (!value || typeof value !== 'string') return null

  const corrected = correctCharacterRecognition(value)

  // 提取数值和单位
  const capacitancePattern = /^(\d+(?:\.\d+)?)\s*(p|n|μ|u|µ|m|f)?$/i
  const match = corrected.match(capacitancePattern)

  if (!match) return null

  const [, numericPart, unit] = match
  const numValue = parseFloat(numericPart)

  // 验证数值范围（1pF 到 10000µF）
  if (numValue < 0.001 || numValue > 10000) return null

  // 标准化单位
  let standardUnit = 'µF'
  if (unit) {
    const unitLower = unit.toLowerCase()
    if (unitLower === 'p') standardUnit = 'pF'
    else if (unitLower === 'n') standardUnit = 'nF'
    else if (unitLower.includes('μ') || unitLower.includes('u')) standardUnit = 'µF'
    else if (unitLower === 'm') standardUnit = 'mF'
    else if (unitLower === 'f') standardUnit = 'F'
  }

  return `${numValue}${standardUnit}`
}

/**
 * 计算两个字符串之间的Levenshtein距离
 * @param str1 字符串1
 * @param str2 字符串2
 * @returns 编辑距离
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = []

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 替换
          matrix[i][j - 1] + 1,     // 插入
          matrix[i - 1][j] + 1      // 删除
        )
      }
    }
  }

  return matrix[str2.length][str1.length]
}

/**
 * 验证组件值是否在合理范围内
 * @param components 所有组件列表
 * @param connections 连接信息
 * @returns 验证结果
 */
function validateComponentValues(components: any[], connections: any[]): any {
  const issues = []
  const componentMap = new Map(components.map(c => [c.id, c]))

  // 分析电路类型
  const circuitType = analyzeCircuitType(components, connections)

  for (const comp of components) {
    if (!comp.label || !comp.type) continue

    const validation = validateComponentValue(comp, circuitType, componentMap)
    if (validation.hasIssue) {
      issues.push({
        componentId: comp.id,
        issue: validation.issue,
        suggestion: validation.suggestion,
        severity: validation.severity
      })
    }
  }

  return {
    circuitType,
    issues,
    isValid: issues.length === 0
  }
}

/**
 * 分析电路类型
 * @param components 组件列表
 * @param connections 连接信息
 * @returns 电路类型分析
 */
function analyzeCircuitType(components: any[], connections: any[]): any {
  const types = components.map(c => c.type?.toLowerCase() || '').filter(Boolean)
  const labels = components.map(c => c.label?.toLowerCase() || '').filter(Boolean)

  const hasOpAmp = types.some(t => t.includes('op') || t.includes('amp'))
  const hasMCU = types.some(t => t.includes('mcu') || t.includes('micro')) ||
                 labels.some(l => l.includes('stm32') || l.includes('atmega') || l.includes('pic'))
  const hasSensors = types.some(t => t.includes('sensor'))
  const hasPower = types.some(t => t.includes('power') || t.includes('regulator'))
  const hasCommunication = types.some(t => t.includes('uart') || t.includes('i2c') || t.includes('spi'))

  return {
    type: hasMCU ? 'embedded' : hasOpAmp ? 'analog' : hasSensors ? 'sensor' : 'general',
    hasOpAmp,
    hasMCU,
    hasSensors,
    hasPower,
    hasCommunication
  }
}

/**
 * 验证单个组件值
 * @param component 组件
 * @param circuitType 电路类型
 * @param componentMap 组件映射
 * @returns 验证结果
 */
function validateComponentValue(component: any, circuitType: any, componentMap: Map<string, any>): any {
  const type = component.type?.toLowerCase() || ''
  const label = component.label || ''

  // 电阻验证
  if (type.includes('resistor')) {
    return validateResistanceValue(label, circuitType, component, componentMap)
  }

  // 电容验证
  if (type.includes('capacitor')) {
    return validateCapacitanceValue(label, circuitType, component, componentMap)
  }

  // IC型号验证
  if (type.includes('ic') || type.includes('chip') || type.includes('op')) {
    return validateICModel(label, circuitType)
  }

  return { hasIssue: false }
}

/**
 * 验证电阻值
 * @param value 电阻值字符串
 * @param circuitType 电路类型
 * @param component 组件
 * @param componentMap 组件映射
 * @returns 验证结果
 */
function validateResistanceValue(value: string, circuitType: any, component: any, componentMap: Map<string, any>): any {
  const resistancePattern = /^(\d+(?:\.\d+)?)\s*(k|m|μ|u|µ|Ω|ohm|ohms|r)?$/i
  const match = value.match(resistancePattern)

  if (!match) {
    return {
      hasIssue: true,
      issue: `Invalid resistance format: ${value}`,
      suggestion: 'Expected format: 1kΩ, 10k, 100R, etc.',
      severity: 'high'
    }
  }

  const [, numericPart, unit] = match
  const numValue = parseFloat(numericPart)

  // 转换为欧姆
  let ohmValue = numValue
  if (unit) {
    const unitLower = unit.toLowerCase()
    if (unitLower === 'k') ohmValue = numValue * 1000
    else if (unitLower === 'm') ohmValue = numValue * 1000000
  }

  // 基于电路类型的合理性检查
  if (circuitType.type === 'analog') {
    // 模拟电路中的典型电阻范围
    if (ohmValue < 10 || ohmValue > 10000000) {
      return {
        hasIssue: true,
        issue: `Resistance ${value} (${ohmValue}Ω) is unusual for analog circuits`,
        suggestion: 'Typical range: 100Ω - 1MΩ for analog circuits',
        severity: 'medium'
      }
    }

    // 特殊检查：反馈电阻通常在1k-100k范围
    if (component.id?.toLowerCase().includes('f') || component.id?.toLowerCase().includes('fb')) {
      if (ohmValue < 1000 || ohmValue > 100000) {
        return {
          hasIssue: true,
          issue: `Feedback resistor ${value} is outside typical range`,
          suggestion: 'Feedback resistors typically 1kΩ - 100kΩ',
          severity: 'low'
        }
      }
    }
  }

  return { hasIssue: false }
}

/**
 * 验证电容值
 * @param value 电容值字符串
 * @param circuitType 电路类型
 * @param component 组件
 * @param componentMap 组件映射
 * @returns 验证结果
 */
function validateCapacitanceValue(value: string, circuitType: any, component: any, componentMap: Map<string, any>): any {
  const capacitancePattern = /^(\d+(?:\.\d+)?)\s*(p|n|μ|u|µ|m|f)?$/i
  const match = value.match(capacitancePattern)

  if (!match) {
    return {
      hasIssue: true,
      issue: `Invalid capacitance format: ${value}`,
      suggestion: 'Expected format: 10nF, 1µF, 100pF, etc.',
      severity: 'high'
    }
  }

  const [, numericPart, unit] = match
  const numValue = parseFloat(numericPart)

  // 转换为微法
  let ufValue = numValue
  if (unit) {
    const unitLower = unit.toLowerCase()
    if (unitLower === 'p') ufValue = numValue / 1000000
    else if (unitLower === 'n') ufValue = numValue / 1000
    else if (unitLower === 'm') ufValue = numValue * 1000
    else if (unitLower === 'f') ufValue = numValue * 1000000
  }

  // 合理性检查
  if (ufValue < 0.000001 || ufValue > 10000) { // 1pF 到 10000µF
    return {
      hasIssue: true,
      issue: `Capacitance ${value} (${ufValue}µF) is outside typical range`,
      suggestion: 'Typical range: 1pF - 10000µF',
      severity: 'medium'
    }
  }

  return { hasIssue: false }
}

/**
 * 验证IC型号
 * @param model IC型号
 * @param circuitType 电路类型
 * @returns 验证结果
 */
function validateICModel(model: string, circuitType: any): any {
  // 这里可以添加基于电路类型的IC验证逻辑
  // 例如，模拟电路通常使用运算放大器，嵌入式电路使用MCU等

  if (!model || model.length < 3) {
    return {
      hasIssue: true,
      issue: `IC model too short or empty: ${model}`,
      suggestion: 'IC models should be at least 3 characters',
      severity: 'high'
    }
  }

  // 检查是否符合IC型号格式
  if (!/^[A-Z0-9]{3,20}$/i.test(model)) {
    return {
      hasIssue: true,
      issue: `IC model format invalid: ${model}`,
      suggestion: 'IC models should contain only letters and numbers',
      severity: 'medium'
    }
  }

  return { hasIssue: false }
}

/**
 * 应用后处理验证和校正到识别结果
 * @param components 识别出的组件列表
 * @param connections 连接信息
 * @returns 校正后的组件列表和验证结果
 */
function applyPostProcessingCorrection(components: any[], connections?: any[]): any {
  // 首先应用字符校正
  let correctedComponents = components.map(comp => {
    const corrected = { ...comp }

    // 确保params对象存在
    if (!corrected.params) {
      corrected.params = {}
    }

    // 校正IC型号
    if (comp.type && (comp.type.toLowerCase().includes('ic') || comp.type.toLowerCase().includes('chip') || comp.type.toLowerCase().includes('opamp') || comp.type.toLowerCase().includes('op-amp')) && comp.label) {
      const correctedModel = validateAndCorrectICModel(comp.label)
      if (correctedModel && correctedModel !== comp.label) {
        corrected.label = correctedModel
        corrected.params.originalLabel = comp.label
        corrected.params.corrected = true
        corrected.params.correctionReason = 'IC model validation'
      }
    }

    // 校正电阻值
    if (comp.type && comp.type.toLowerCase().includes('resistor') && comp.label) {
      const correctedValue = validateAndCorrectResistance(comp.label)
      if (correctedValue && correctedValue !== comp.label) {
        corrected.label = correctedValue
        corrected.params.originalLabel = comp.label
        corrected.params.corrected = true
        corrected.params.correctionReason = 'Resistance value validation'
      }
    }

    // 校正电容值
    if (comp.type && comp.type.toLowerCase().includes('capacitor') && comp.label) {
      const correctedValue = validateAndCorrectCapacitance(comp.label)
      if (correctedValue && correctedValue !== comp.label) {
        corrected.label = correctedValue
        corrected.params.originalLabel = comp.label
        corrected.params.corrected = true
        corrected.params.correctionReason = 'Capacitance value validation'
      }
    }

    return corrected
  })

  // 然后进行数值合理性验证
  const validationResult = validateComponentValues(correctedComponents, connections || [])

  return {
    components: correctedComponents,
    validation: validationResult
  }
}

// ========================================
// OCR辅助识别系统（已移除）
// ========================================

/**
 * OCR 功能已从项目中移除。为了保持与上层调用的兼容性，这里返回一个空的 OCR 结果结构。
 * @param imagePath 图片路径
 * @returns 空的 OCR 识别结果
 */
async function performOCRRecognition(imagePath: string): Promise<any> {
  try {
    logInfo('ocr.disabled', { imagePath, reason: 'OCR functionality removed' })
  } catch (e) {}
    return {
      success: false,
    error: 'ocr_disabled',
      extractedComponents: [],
      extractedValues: []
  }
}

/**
 * 解析OCR识别的文本，提取元件相关信息
 * @param text 完整识别文本
 * @param words 单词级识别结果
 * @returns 解析后的元件信息
 */
function parseOCRText(text: string, words: any[]): any {
  const components: any[] = []
  const values: any[] = []

  // 清理文本，保留中文字符
  const cleanText = text.replace(/\s+/g, ' ').trim()

  // 查找可能的元件标记（支持中英文混合和繁体字）
  const componentPatterns = [
    // IC芯片: U1, IC1, CHIP1, 芯片1, 晶片1等
    /\b(U|IC|CHIP|芯片|晶片|集成电路|積體電路)\d+\b/gi,
    // 电阻: R1, RES1, 电阻1, 電阻1等
    /\b(R|RES|RESISTOR|电阻|電阻|R\d+)\d*\b/gi,
    // 电容: C1, CAP1, 电容1, 電容1等
    /\b(C|CAP|CAPACITOR|电容|電容|C\d+)\d*\b/gi,
    // 电感: L1, IND1, 电感1, 電感1等
    /\b(L|IND|INDUCTOR|电感|電感|L\d+)\d*\b/gi,
    // 二极管: D1, DIODE1, 二极管1, 二極管1等
    /\b(D|DIODE|二极管|二極管|D\d+)\d*\b/gi,
    // 晶体管: Q1, TRANSISTOR1, 晶体管1, 三极管1, 晶體管1等
    /\b(Q|TRANSISTOR|晶体管|三极管|晶體管|三極管|Q\d+)\d*\b/gi,
    // 连接器: J1, CONN1, 连接器1, 連接器1等
    /\b(J|CONN|CONNECTOR|连接器|連接器|接口|介面|J\d+)\d*\b/gi,
    // 电源: VCC, GND, 电源, 電源等
    /\b(VCC|GND|VDD|VSS|电源|地|電源|GND)\b/gi,
    // 开关: SW1, SWITCH1, 开关1, 開關1等
    /\b(SW|SWITCH|开关|開關|SW\d+)\d*\b/gi,
    // 电位器: VR1, POT1, 电位器1, 電位器1等
    /\b(VR|POT|POTENTIOMETER|电位器|電位器|VR\d+)\d*\b/gi,
    // 变压器: T1, TRANS1, 变压器1, 變壓器1等
    /\b(T|TRANS|TRANSFORMER|变压器|變壓器|T\d+)\d*\b/gi
  ]

  // 查找元件标识符
  componentPatterns.forEach(pattern => {
    const matches = cleanText.match(pattern)
    if (matches) {
      matches.forEach(match => {
        const component = parseComponentFromText(match, cleanText)
        if (component) {
          components.push(component)
        }
      })
    }
  })

  // 查找数值标记（阻值、容值等）- 支持简繁体中文
  const valuePatterns = [
    // 电阻值: 1k, 10k, 100R, 2.2kΩ, 1千欧, 1千歐等
    /\b\d+(\.\d+)?\s*(k|千|K|兆|M|m|μ|u|µ|Ω|欧|歐|ohm|r|R|欧姆|歐姆)\b/gi,
    // 电容值: 10nF, 1uF, 100pF, 1微法, 1微法等
    /\b\d+(\.\d+)?\s*(p|皮|P|n|纳|納|N|μ|u|µ|微|m|毫|M|f|F|法|法拉)\b/gi,
    // 电感值: 1uH, 10mH, 1微亨, 1微亨等
    /\b\d+(\.\d+)?\s*(p|皮|P|n|纳|納|N|μ|u|µ|微|m|毫|M|H|亨|亨利)\b/gi,
    // 电压值: 5V, 3.3V, 5伏, 5伏等
    /\b\d+(\.\d+)?\s*(V|伏)\b/gi,
    // 电流值: 1A, 100mA, 1安, 1安等
    /\b\d+(\.\d+)?\s*(A|安|mA|毫安|uA|微安)\b/gi,
    // 功率值: 1W, 100mW, 1瓦, 1瓦等
    /\b\d+(\.\d+)?\s*(W|瓦|mW|毫瓦)\b/gi,
    // 频率值: 1MHz, 100kHz, 1兆赫, 1兆赫等
    /\b\d+(\.\d+)?\s*(Hz|赫|kHz|千赫|兆赫|Mhz|GHz|吉赫)\b/gi,
    // IC型号: 常见的IC型号格式（支持中文前缀）
    /\b[A-Z]{2,6}\d{1,4}[A-Z0-9]*\b/g,
    // 中文数值: 一千欧, 10微法, 一千歐, 10微法等
    /\b(\d+(\.\d+)?)\s*(千|兆|微|纳|納|皮|欧|歐|法|亨|伏|安|瓦|赫)\b/gi
  ]

  // 查找数值
  valuePatterns.forEach(pattern => {
    const matches = cleanText.match(pattern)
    if (matches) {
      matches.forEach(match => {
        const processedValue = processChineseValue(match.trim())
        values.push({
          value: processedValue,
          original: match.trim(),
          type: inferValueType(processedValue),
          confidence: calculateWordConfidence(match, words), // 基于单词置信度
          language: detectTextLanguage(match) // 检测语言
        })
      })
    }
  })

  return {
    components,
    values: [...new Set(values.map(v => v.value))].map(val => values.find(v => v.value === val))
  }
}

/**
 * 从文本中解析元件信息
 * @param componentId 元件标识符
 * @param contextText 上下文文本
 * @returns 元件信息
 */
function parseComponentFromText(componentId: string, contextText: string): any {
  // 查找该元件附近的数值或型号信息
  const idPattern = new RegExp(`\\b${componentId}\\b.*?([A-Z0-9]+(?:[ΩµμkMnpuF\\.]+)?)`, 'gi')
  const match = contextText.match(idPattern)

  if (match && match[1]) {
    const value = match[1].trim()

    return {
      id: componentId.toUpperCase(),
      type: inferComponentType(componentId),
      label: value,
      source: 'ocr',
      confidence: 0.6
    }
  }

  return {
    id: componentId.toUpperCase(),
    type: inferComponentType(componentId),
    source: 'ocr',
    confidence: 0.5
  }
}

/**
 * 根据元件标识符推断元件类型
 * @param componentId 元件标识符
 * @returns 元件类型
 */
function inferComponentType(componentId: string): string {
  const id = componentId.toUpperCase()

  if (id.startsWith('U') || id.startsWith('IC')) return 'ic'
  if (id.startsWith('R')) return 'resistor'
  if (id.startsWith('C')) return 'capacitor'
  if (id.startsWith('L')) return 'inductor'
  if (id.startsWith('D')) return 'diode'
  if (id.startsWith('Q')) return 'transistor'
  if (id.startsWith('J')) return 'connector'

  return 'unknown'
}

/**
 * 推断数值的类型
 * @param value 数值字符串
 * @returns 数值类型
 */
function inferValueType(value: string): string {
  const lowerValue = value.toLowerCase()

  // 检查是否包含电阻单位
  if (lowerValue.includes('k') || lowerValue.includes('m') || lowerValue.includes('ω') || lowerValue.includes('ohm') || lowerValue.includes('r')) {
    return 'resistance'
  }

  // 检查是否包含电容单位
  if (lowerValue.includes('p') || lowerValue.includes('n') || lowerValue.includes('μ') || lowerValue.includes('u') || lowerValue.includes('µ') || lowerValue.includes('f')) {
    return 'capacitance'
  }

  // 检查是否是IC型号格式
  if (/^[A-Z]{2,6}\d{1,4}[A-Z0-9]*$/.test(value.toUpperCase())) {
    return 'ic_model'
  }

  return 'unknown'
}

/**
 * 将OCR结果与大模型结果进行融合
 * @param visionComponents 大模型识别的组件
 * @param ocrResult OCR识别结果
 * @returns 融合后的组件列表
 */
function fuseVisionAndOCRResults(visionComponents: any[], ocrResult: any): any[] {
  if (!ocrResult.success || !ocrResult.extractedComponents) {
    return visionComponents
  }

  const fusedComponents = [...visionComponents]

  // 为每个大模型识别的组件寻找OCR补充信息
  visionComponents.forEach(visionComp => {
    // 查找匹配的OCR组件
    const matchingOCRComp = ocrResult.extractedComponents.find((ocrComp: any) => {
      const vid = (visionComp && typeof visionComp.id === 'string') ? visionComp.id : ''
      const oid = (ocrComp && typeof ocrComp.id === 'string') ? ocrComp.id : ''
      if (!vid && !oid) return false
      if (vid && oid && vid === oid) return true
      return (vid && oid) ? vid.toLowerCase() === oid.toLowerCase() : false
    })

    if (matchingOCRComp) {
      // 如果OCR有更具体的标签信息，添加到params中作为候选
      if (matchingOCRComp.label && matchingOCRComp.label !== visionComp.label) {
        if (!visionComp.params) visionComp.params = {}
        if (!visionComp.params.ocrCandidates) visionComp.params.ocrCandidates = []
        visionComp.params.ocrCandidates.push({
          source: 'ocr',
          label: matchingOCRComp.label,
          confidence: matchingOCRComp.confidence,
          timestamp: new Date().toISOString()
        })
      }
    }
  })

  // 添加OCR独有的组件（如果大模型没有识别到）
  ocrResult.extractedComponents.forEach((ocrComp: any) => {
    const existsInVision = visionComponents.some((vc: any) => {
      const vid = (vc && typeof vc.id === 'string') ? vc.id : ''
      const oid = (ocrComp && typeof ocrComp.id === 'string') ? ocrComp.id : ''
      if (!vid && !oid) return false
      if (vid && oid && vid === oid) return true
      return (vid && oid) ? vid.toLowerCase() === oid.toLowerCase() : false
    })

    if (!existsInVision && ocrComp.confidence > 0.5) {
      // 标记为OCR发现的组件
      ocrComp.params = {
        ...ocrComp.params,
        discoveredBy: 'ocr',
        confidence: ocrComp.confidence
      }
      fusedComponents.push(ocrComp)
    }
  })

  return fusedComponents
}

// ========================================
// 多轮识别分析和优化
// ========================================

/**
 * 分析各轮次识别结果的特点和权重
 * @param results 多轮识别结果数组
 * @returns 各轮次的分析信息
 */
function analyzeRecognitionPasses(results: any[]): any {
  const passes: any[] = []

  results.forEach((result, idx) => {
    const passNumber = idx + 1
    const totalPasses = results.length
    let specialization = 'general'
    let strategy = 'General recognition'
    let focus = 'All components and connections'
    let weight = 'medium'

    // 根据轮次确定专业化方向
    if (passNumber === 1) {
      specialization = 'macro'
      strategy = 'Macro recognition - component locations and basic types'
      focus = 'Component positions, types, and basic connections'
      weight = 'medium'
    } else if (passNumber === 2 || (totalPasses >= 3 && passNumber === Math.ceil(totalPasses / 2))) {
      specialization = 'IC-focused'
      strategy = 'IC specialized recognition - model numbers and pins'
      focus = 'IC chips, model numbers, manufacturer prefixes, pin information'
      weight = 'high'
    } else if (passNumber === 3 || (totalPasses >= 4 && passNumber === totalPasses - 1)) {
      specialization = 'RC-focused'
      strategy = 'Resistor/Capacitor specialized recognition - values and parameters'
      focus = 'Component values, units, tolerances, voltage ratings'
      weight = 'high'
    } else if (passNumber === totalPasses) {
      specialization = 'verification'
      strategy = 'Verification pass - cross-validation and error correction'
      focus = 'Data validation, error correction, completeness check'
      weight = 'high'
    }

    // 分析结果质量指标
    const components = result.components || []
    const connections = result.connections || []

    const qualityMetrics = {
      totalComponents: components.length,
      totalConnections: connections.length,
      componentsWithLabels: components.filter((c: any) => c.label && c.label.trim()).length,
      componentsWithValues: components.filter((c: any) => {
        const label = (c.label || '').toLowerCase()
        return /\d/.test(label) && (label.includes('k') || label.includes('m') || label.includes('µ') || label.includes('u') || label.includes('n') || label.includes('p') || label.includes('ω') || label.includes('ohm'))
      }).length,
      icComponents: components.filter((c: any) => {
        const type = (c.type || '').toLowerCase()
        const label = (c.label || '').toUpperCase()
        return type.includes('ic') || type.includes('chip') || type.includes('op') || /^[A-Z]{2,4}\d/.test(label)
      }).length,
      componentsWithPins: components.filter((c: any) => Array.isArray(c.pins) && c.pins.length > 0).length
    }

    passes.push({
      passNumber,
      specialization,
      strategy,
      focus,
      weight,
      qualityMetrics
    })
  })

  return {
    totalPasses: results.length,
    passes,
    summary: `Analysis of ${results.length} recognition passes with specialized strategies for different component types`
  }
}

// ========================================
// 多轮识别核心函数实现
// ========================================

/**
 * 对单张图片进行一次视觉识别
 * @param img 图片信息
 * @param apiUrl API地址
 * @param model 模型名称
 * @param authHeader 认证头
 * @returns 识别结果 {components, connections}
 */
async function recognizeSingleImage(
  img: { path: string; originalname: string },
  apiUrl: string,
  model: string,
  authHeader?: string,
  passNumber?: number,
  recognitionPasses?: number,
  timeline?: { step: string; ts?: number; meta?: any }[],
  progressId?: string
): Promise<any> {
  const visionTimeout = Number(process.env.VISION_TIMEOUT_MS || '7200000')
  const fetchRetries = Number(process.env.FETCH_RETRIES || '1')
  const keepAliveAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: Number(process.env.KEEP_ALIVE_MSECS || '60000') })

  // 准备文件缓冲 - 内存优化
  const stat = fs.existsSync(img.path) ? fs.statSync(img.path) : null
  const fileSize = stat ? stat.size : 0
  const MEM_BUFFER_THRESHOLD = 5 * 1024 * 1024 // 5MB阈值
  const useBuffer = fileSize > 0 && fileSize <= MEM_BUFFER_THRESHOLD
  let fileBuffer: Buffer | null = null

  if (useBuffer) {
    try {
      fileBuffer = fs.readFileSync(img.path)
      logInfo('vision.file_buffered', {
        filename: img.originalname,
        fileSize: fileSize + ' bytes',
        useBuffer: true
      })
    } catch (e) {
      fileBuffer = null
      logError('vision.file_buffer_failed', {
        filename: img.originalname,
        error: String(e)
      })
    }
  } else {
    logInfo('vision.file_streaming', {
      filename: img.originalname,
      fileSize: fileSize + ' bytes',
      useBuffer: false,
      reason: fileSize > MEM_BUFFER_THRESHOLD ? 'file too large' : 'file not accessible'
    })
  }

  // 根据识别阶段生成专业的电子元件识别prompt
  // 注意：区分 `undefined` 与 0，允许上层通过传入 0 来强制使用通用 prompt（单轮场景）
  const passNum = (typeof passNumber === 'number') ? passNumber : 1
  const totalPassesNum = (typeof recognitionPasses === 'number') ? recognitionPasses : 1
  // 单轮识别直接使用通用识别 prompt（避免只做宏观定位）
  let promptText: string
  if (totalPassesNum === 1) {
    promptText = generateGeneralRecognitionPrompt()
  } else {
    promptText = generateSpecializedPrompt(passNum, totalPassesNum)
  }

  // 备用prompt（通用识别）
  const fallbackPromptText = `You are an expert circuit schematic parser. If the primary prompt fails, attempt to return a single valid JSON object with keys: components, connections, metadata.

Return a minimal example following the same schema as the primary prompt. Do NOT include any explanatory text.

Example:
{
  "components": [{"id":"U1","type":"ic","label":"AD825","params":{"manufacturer_part":"AD825"},"confidence":0.9}],
  "connections": [{"from":{"componentId":"U1","pin":"1"},"to":{"componentId":"R1","pin":"1"},"confidence":0.9}],
  "metadata": {"source_type":"image","timestamp":"2025-01-01T00:00:00Z","overall_confidence":0.9,"inference_time_ms":100}
}`

  // 构造尝试URL列表
  let tryUrls: string[] = []
  let isOpenRouterHost = false
  try {
    const u = new URL(apiUrl)
    const host = (u.hostname || '').toLowerCase()
    isOpenRouterHost = host.includes('openrouter.ai')
    if (isOpenRouterHost) {
      if (u.pathname && u.pathname !== '/') tryUrls.push(apiUrl)
      tryUrls.push(u.origin + '/api/v1/chat/completions')
      tryUrls.push(u.origin + '/api/v1/chat')
      tryUrls.push(u.origin + '/chat/completions')
    } else {
      tryUrls.push(apiUrl)
    }
  } catch (e) {
    tryUrls.push(apiUrl)
  }

  // 带重试的fetch函数
  const fetchWithRetryLocal = async (url: string, opts: any, retries: number) => {
    let lastErr: any = null
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        opts.agent = opts.agent || keepAliveAgent
        const r = await fetch(url, opts)
        return r
      } catch (e) {
        lastErr = e
        logError('vision.fetch.retry', { url, attempt, error: String(e) })
        if (attempt < retries) {
          const delay = Math.min(30000, 1000 * Math.pow(2, attempt))
          await new Promise((res) => setTimeout(res, delay))
        }
      }
    }
    throw lastErr
  }

  // 主要识别尝试
  let result = await performRecognitionAttempt(img, tryUrls, isOpenRouterHost, promptText, model, authHeader, fileBuffer, visionTimeout, fetchRetries, fetchWithRetryLocal, timeline, progressId, passNumber, recognitionPasses)

  // 如果主要尝试失败，尝试备用prompt
  if (!result || (!Array.isArray(result.components) && !Array.isArray(result.connections))) {
    logInfo('vision.trying_fallback', { filename: img.originalname })
    result = await performRecognitionAttempt(img, tryUrls, isOpenRouterHost, fallbackPromptText, model, authHeader, fileBuffer, visionTimeout, fetchRetries, fetchWithRetryLocal, timeline, progressId, passNumber, recognitionPasses)
  }

  // 最终验证结果
  if (!result || (!Array.isArray(result.components) && !Array.isArray(result.connections))) {
    logError('vision.recognition_failed', {
      filename: img.originalname,
      result: result
    })
    return { components: [], connections: [] }
  }

  return result
}

/**
 * 执行单次识别尝试
 */
async function performRecognitionAttempt(
  img: { path: string; originalname: string },
  tryUrls: string[],
  isOpenRouterHost: boolean,
  promptText: string,
  model: string,
  authHeader: string | undefined,
  fileBuffer: Buffer | null,
  visionTimeout: number,
  fetchRetries: number,
  fetchWithRetryLocal: any,
  timeline?: { step: string; ts?: number; meta?: any }[],
  progressId?: string,
  passNumber?: number,
  recognitionPasses?: number
): Promise<any> {
  for (const tryUrl of tryUrls) {
    // 在每次尝试前记录 vision_model_request（包含脱敏请求信息与输入图像副本）
    try {
      const { saveArtifact, saveArtifactFromPath, computeSha1 } = require('./artifacts')
      const info: any = {
        apiUrlOrigin: (() => { try { return new URL(tryUrl).origin } catch(e){ return tryUrl } })(),
        model,
        prompt: promptText,
        headers: { hasAuth: !!authHeader, contentType: isOpenRouterHost ? 'application/json' : 'multipart/form-data' },
        file: { name: img.originalname }
      }
      try {
        const buf = fileBuffer || (fs.existsSync(img.path) ? fs.readFileSync(img.path) : null)
        if (buf) info.file.sha1 = computeSha1(buf)
        info.file.size = buf ? buf.length : (fs.existsSync(img.path) ? fs.statSync(img.path).size : 0)
      } catch {}
      const reqA = await saveArtifact(JSON.stringify(info, null, 2), `vision_request_payload_${img.originalname}`, { ext: '.json', contentType: 'application/json' })
      let imgA: any = null
      try { if (fs.existsSync(img.path)) imgA = await saveArtifactFromPath(img.path, `uploaded_image_${img.originalname}`) } catch {}
      if (timeline) {
        const it = { step: 'vision_model_request', ts: Date.now(), meta: { type: 'ai_interaction', modelType: 'vision', tryUrl, filename: img.originalname, requestArtifact: reqA, imageArtifact: imgA, description: '视觉模型请求（脱敏）', passNumber: typeof passNumber === 'number' ? passNumber : 1, passOfTotal: typeof recognitionPasses === 'number' ? recognitionPasses : 1 } }
        timeline.push(it)
        try { if (progressId) pushProgress(progressId, it) } catch {}
      }
    } catch {}
    let stream: any = null
    try {
      let resp: any = null

      if (isOpenRouterHost) {
        // OpenRouter JSON模式
        const lower = (img.originalname || '').toLowerCase()
        let mime = 'application/octet-stream'
        if (lower.endsWith('.png')) mime = 'image/png'
        else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg'
        else if (lower.endsWith('.webp')) mime = 'image/webp'
        else if (lower.endsWith('.gif')) mime = 'image/gif'
        else if (lower.endsWith('.pdf')) mime = 'application/pdf'

        const buf = fileBuffer || fs.readFileSync(img.path)
        const dataUrl = `data:${mime};base64,${buf.toString('base64')}`

        const payload = {
          model,
          messages: [
            { role: 'system', content: 'You are an expert circuit diagram parser. Return ONLY JSON with keys: components[], connections[]; no extra text.' },
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
        }

        const headers: any = { 'Content-Type': 'application/json' }
        if (authHeader) headers['Authorization'] = authHeader
        if (process?.env?.OPENROUTER_HTTP_REFERER) headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER
        if (process?.env?.OPENROUTER_X_TITLE) headers['X-Title'] = process.env.OPENROUTER_X_TITLE

        ;(payload as any).stream = false
        resp = await fetchWithRetryLocal(tryUrl, { method: 'POST', body: JSON.stringify(payload), headers, timeout: visionTimeout }, fetchRetries)

      } else {
        // Multipart模式
        const form = new (require('form-data'))()
        if (fileBuffer) {
          form.append('file', fileBuffer, { filename: img.originalname })
        } else {
          stream = fs.createReadStream(img.path)
          form.append('file', stream, { filename: img.originalname })
        }
        form.append('prompt', promptText)
        form.append('model', model)

        const headers: any = Object.assign({}, form.getHeaders())
        if (authHeader) headers['Authorization'] = authHeader

        resp = await fetchWithRetryLocal(tryUrl, { method: 'POST', body: form, headers, timeout: visionTimeout }, fetchRetries)
      }

      if (!resp || !resp.ok) {
        logError('vision.attempt_failed', { tryUrl, status: resp?.status })
        continue
      }

      const txt = await resp.text()
      const parsed = parseVisionResponse(txt)

      if (parsed && (Array.isArray(parsed.components) || Array.isArray(parsed.connections))) {
        logInfo('vision.attempt_success', { tryUrl, filename: img.originalname })
        // 中文注释：将视觉模型的单次返回记录到 timeline，便于前端按序展示模型返回内容
        try {
          const _timeline = timeline
          if (_timeline) {
            const summary = {
              components: Array.isArray(parsed.components) ? parsed.components.length : undefined,
              connections: Array.isArray(parsed.connections) ? parsed.connections.length : undefined
            }
            // 保存 response 作为 artifact（文本/JSON），并在 timeline 中引用
            try {
              const { saveArtifact } = require('./artifacts')
              const respStr = JSON.stringify(parsed, null, 2)
              const a = await saveArtifact(respStr, `vision_response_${img.originalname}`)
              const item = {
                step: 'vision_model_response',
                ts: Date.now(),
                meta: {
                  type: 'ai_interaction',
                  modelType: 'vision',
                  tryUrl,
                  filename: img.originalname,
                  summary,
                  snippet: respStr.substring(0, 1024),
                  responseArtifact: a,
                  description: '视觉模型返回结构化JSON结果',
                  passNumber: typeof passNumber === 'number' ? passNumber : 1,
                  passOfTotal: typeof recognitionPasses === 'number' ? recognitionPasses : 1
                }
              }
              _timeline.push(item)
              try { if (progressId) pushProgress(progressId, item as any) } catch {}
            } catch (e) {
              // 如果 artifact 保存失败，退回到仅记录摘要
              const item = {
                step: 'vision_model_response',
                ts: Date.now(),
                meta: {
                  type: 'ai_interaction',
                  modelType: 'vision',
                  tryUrl,
                  filename: img.originalname,
                  summary,
                  note: 'vision model returned structured JSON result (artifact save failed)',
                  description: '视觉模型返回结果（artifact 保存失败）',
                  passNumber: typeof passNumber === 'number' ? passNumber : 1,
                  passOfTotal: typeof recognitionPasses === 'number' ? recognitionPasses : 1
                }
              }
              _timeline.push(item as any)
              try { if (progressId) pushProgress(progressId, item as any) } catch {}
            }
          }
        } catch (e) { /* 忽略 timeline 推送错误，避免影响主流程 */ }
        return parsed
      }

    } catch (e) {
      logError('vision.attempt_exception', { tryUrl, filename: img.originalname, error: String(e) })
    } finally {
      if (stream && typeof stream.destroy === 'function') {
        try { stream.destroy() } catch (e) { /* ignore */ }
      }
    }
  }

  return null
}

/**
 * 解析视觉模型响应
 */
function parseVisionResponse(txt: string): any {
  // 检测HTML响应
  const ct = 'application/json' // 简化处理
  if (txt.includes('<html') || txt.includes('<!doctype')) {
    throw new Error(`vision upstream returned HTML`)
  }

  let parsed: any = null
  let wrapper: any = null

  try {
    wrapper = JSON.parse(txt)
    // OpenRouter/OpenAI兼容：从choices[0].message.content提取JSON
    if (wrapper && wrapper.choices && Array.isArray(wrapper.choices) && wrapper.choices[0]) {
      const c = wrapper.choices[0]
      const content = (c.message && c.message.content) || c.text || ''
      if (content && typeof content === 'string') {
        // 尝试多种方式提取JSON
        let jsonMatch = content.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          jsonMatch = content.match(/(?:\{[\s\S]*"components"[\s\S]*\}|\{[\s\S]*"connections"[\s\S]*\})/)
        }
        if (!jsonMatch && content.includes('components')) {
          const start = content.indexOf('{')
          const lastBrace = content.lastIndexOf('}')
          if (start >= 0 && lastBrace > start) {
            const potentialJson = content.substring(start, lastBrace + 1)
            try {
              parsed = JSON.parse(potentialJson)
            } catch (e) {
              // 继续尝试其他方法
            }
          }
        }
        if (jsonMatch && !parsed) {
          parsed = JSON.parse(jsonMatch[0])
        }
      }
    }
  } catch (e) {
    // 非JSON响应：尝试直接从文本中抽取JSON
    const m = txt.match(/\{[\s\S]*\}/)
    if (m) {
      try { parsed = JSON.parse(m[0]) } catch (e2) { /* fallthrough */ }
    }
  }

  return parsed || wrapper
}

/**
 * 对同一图片进行多轮识别
 * @param img 图片信息
 * @param apiUrl API地址
 * @param model 模型名称
 * @param authHeader 认证头
 * @param passes 识别轮数
 * @returns 多轮识别结果数组
 */
async function doMultiPassRecognition(
  img: { path: string; originalname: string },
  apiUrl: string,
  model: string,
  authHeader: string | undefined,
  passes: number,
  timeline?: { step: string; ts: number; meta?: any }[],
  progressId?: string
): Promise<any[]> {
  const results: any[] = []
  const startTime = Date.now()

  logInfo('vision.multi_pass.start', {
    filename: img.originalname,
    totalPasses: passes
  })

  // 记录多轮识别开始到timeline
  if (timeline) {
    const it = { step: 'multi_pass_recognition_start', ts: startTime, meta: { type: 'vision_multi_pass', totalPasses: passes, description: `开始多轮视觉识别，共${passes}轮` } }
    timeline.push(it)
    try { if (progressId) pushProgress(progressId, it) } catch {}
  }

  // 性能优化：根据passes数量动态调整并发度
  // 固定为5步流程时，强制将 passes 视为5，并设置并发度策略
  if (passes !== 5) {
    logWarn('vision.multi_pass.forced_passes', { requestedPasses: passes, forcedPasses: 5 })
    passes = 5
  }

  // 并发策略：对于固定5步，使用并发度2以平衡速度与稳定性
  const maxConcurrent = 2
  const batches: any[][] = []

  for (let i = 0; i < passes; i += maxConcurrent) {
    batches.push(Array.from({ length: Math.min(maxConcurrent, passes - i) }, (_, idx) => idx + i))
  }

  logInfo('vision.multi_pass.concurrency', {
    filename: img.originalname,
    maxConcurrent,
    batchCount: batches.length
  })

  for (const batch of batches) {
    const batchPromises = batch.map(async (passIndex) => {
      const passNumber = passIndex + 1
      logInfo('vision.multi_pass.attempt', {
        filename: img.originalname,
        pass: passNumber,
        totalPasses: passes
      })

      try {
        // 对于固定5步流程，传入 passNumber 与固定 passes=5
        const result = await recognizeSingleImage(img, apiUrl, model, authHeader, passNumber, 5, timeline, progressId)

        // 为结果添加轮次标识
        if (result.components) {
          result.components.forEach((comp: any) => {
            if (!comp.params) comp.params = {}
            comp.params._recognitionPass = passNumber
          })
        }

        logInfo('vision.multi_pass.result', {
          filename: img.originalname,
          pass: passNumber,
          componentsCount: result.components?.length || 0,
          connectionsCount: result.connections?.length || 0
        })

        return result

      } catch (e) {
        logError('vision.multi_pass.error', {
          filename: img.originalname,
          pass: passNumber,
          error: String(e)
        })
        return { components: [], connections: [] }
      }
    })

    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults)
  }

  const endTime = Date.now()
  const totalTime = endTime - startTime

  logInfo('vision.multi_pass.complete', {
    filename: img.originalname,
    totalResults: results.length,
    successfulResults: results.filter(r => (r.components?.length || 0) + (r.connections?.length || 0) > 0).length,
    totalProcessingTime: totalTime + 'ms',
    averageTimePerPass: results.length > 0 ? Math.round(totalTime / results.length) + 'ms' : '0ms'
  })

  // 记录多轮识别完成到timeline
  if (timeline) {
    try {
      // 保存多轮结果汇总为 artifact
      const { saveArtifact } = require('./artifacts')
      const multiSummary = {
        totalPasses: passes,
        successfulPasses: results.filter(r => (r.components?.length || 0) + (r.connections?.length || 0) > 0).length,
        totalProcessingTime: totalTime,
        averageTimePerPass: results.length > 0 ? Math.round(totalTime / results.length) : 0,
        resultsSummary: results.map((r, idx) => ({ pass: idx + 1, components: (r.components || []).length, connections: (r.connections || []).length }))
      }
      const a = await saveArtifact(JSON.stringify(multiSummary, null, 2), `multi_pass_summary_${img.originalname}`)
      const it = { step: 'multi_pass_recognition_done', ts: endTime, meta: Object.assign({ type: 'vision_multi_pass', totalPasses: passes, description: `多轮视觉识别完成，${results.length}轮中有${multiSummary.successfulPasses}轮成功` }, { multiPassSummaryArtifact: a }) }
      timeline.push(it)
      try { if (progressId) pushProgress(progressId, it) } catch {}
    } catch (e) {
      const it = { step: 'multi_pass_recognition_done', ts: endTime, meta: { type: 'vision_multi_pass', totalPasses: passes, successfulPasses: results.filter(r => (r.components?.length || 0) + (r.connections?.length || 0) > 0).length, totalProcessingTime: totalTime, averageTimePerPass: results.length > 0 ? Math.round(totalTime / results.length) : 0, description: `多轮视觉识别完成，${results.length}轮中有${results.filter(r => (r.components?.length || 0) + (r.connections?.length || 0) > 0).length}轮成功`, note: 'artifact save failed' } }
      timeline.push(it)
      try { if (progressId) pushProgress(progressId, it) } catch {}
    }
  }

  return results
}

/**
 * 整合多轮识别结果，通过大模型进行智能整合
 * @param results 多轮识别结果数组
 * @param apiUrl API地址
 * @param model 模型名称
 * @param authHeader 认证头
 * @returns 整合后的最终结果
 */
async function consolidateRecognitionResults(
  results: any[],
  apiUrl: string,
  model: string,
  authHeader: string | undefined,
  timeline?: { step: string; ts: number; meta?: any }[],
  progressId?: string
): Promise<any> {
  if (results.length === 0) {
    return { components: [], connections: [] }
  }

  if (results.length === 1) {
    return results[0]
  }

  logInfo('vision.consolidation.start', {
    totalResults: results.length
  })

  // 记录结果整合开始到timeline
  if (timeline) {
    const it = { step: 'recognition_consolidation_start', ts: Date.now(), meta: { type: 'vision_consolidation', resultCount: results.length, description: `开始整合${results.length}个识别结果` } }
    timeline.push(it)
    try { if (progressId) pushProgress(progressId, it) } catch {}
  }

  // 分析各轮次的识别特点和权重
  const passAnalysis = analyzeRecognitionPasses(results)

  // 构建智能整合prompt
  const consolidationPrompt = `I have ${results.length} specialized circuit diagram recognition results from analyzing the same schematic image with different recognition strategies. Your task is to intelligently consolidate them into a single, most accurate result.

RECOGNITION PASS ANALYSIS:
${passAnalysis.summary}

Pass Details:
${passAnalysis.passes.map((p: any, idx: number) => `Pass ${idx + 1}: ${p.specialization} (${p.weight} priority) - ${p.strategy}`).join('\n')}

RECOGNITION RESULTS:
${results.map((result, idx) => {
  const passInfo = passAnalysis.passes[idx]
  return `
=== Recognition Pass ${idx + 1} (${passInfo.specialization}) ===
Strategy: ${passInfo.strategy}
Focus: ${passInfo.focus}
Weight: ${passInfo.weight}
Component Count: ${(result.components || []).length}
Connection Count: ${(result.connections || []).length}
Components: ${JSON.stringify(result.components || [], null, 2)}
Connections: ${JSON.stringify(result.connections || [], null, 2)}`
}).join('\n')}

SPECIALIZED CONSOLIDATION INSTRUCTIONS:

1. **IC Component Priority** (Highest Priority - Use IC-specialized passes):
   - IC model numbers and manufacturer prefixes are CRITICAL
   - Prefer IC identification from passes 2+ (IC-specialized recognition)
   - Cross-validate IC models against known manufacturers (STM, AD, MAX, TI, etc.)
   - Correct common OCR errors: 1↔I↔l, 0↔O↔o, 5↔S, 8↔B
   - Validate pin counts match package types (DIP8=8 pins, SOIC14=14 pins, etc.)

2. **Resistor/Capacitor Value Priority** (High Priority - Use RC-specialized passes):
   - Component values from passes 3+ are most reliable for R/C components
   - Correct unit interpretations: Ω vs OHM, µ vs u, k vs K
   - Validate value ranges: resistors (1Ω-10MΩ), capacitors (1pF-10000µF)
   - Handle multipliers correctly: "2k2" = 2.2kΩ, "4u7" = 4.7µF

3. **Component Type and Position** (Medium Priority - Use macro passes):
   - Use pass 1 (macro recognition) for component locations and basic types
   - Validate component reference designators (R1, C1, U1, etc.)
   - Ensure component types are consistent across passes

4. **Connection Analysis** (Consistent across all passes):
   - Combine connections from all passes, removing duplicates
   - Prioritize connections that appear in multiple specialized passes
   - Validate connections reference existing components

5. **Quality Validation Rules**:
   - IC models should contain manufacturer prefix + numbers (e.g., "STM32F407", "AD8606")
   - Component values should be within reasonable engineering ranges
   - Reference designators should follow standard conventions (R/C/U/Q/D/L)
   - Pin counts should match component types and packages

6. **Error Correction**:
   - Fix obvious OCR errors in model numbers and values
   - Standardize units and formats
   - Remove components that appear to be false positives

OUTPUT FORMAT:
Return a single valid JSON object with keys:
  - "components": array of consolidated component objects
  - "connections": array of consolidated connection objects
  - "decisions": array of decision entries produced by the final validation pass (see schema below)
  - "conflicts": array of conflict descriptors
  - "uncertainties": array of entries that require human review

Each component must have: id, type, and optionally: label, params, pins, sourcePasses
Each connection must have: from (with componentId, pin), to (with componentId, pin), confidence, sourcePasses

Decision entry schema (from final verification pass):
  - entityId, entityType, field, originalValue, finalValue, sourcePasses, decisionReason, confidence, action

If unable to decide on an item, include it in "uncertainties" with a recommended action (e.g., "human_review").

Focus on accuracy and provide a machine-readable audit trail (decisions) explaining key merges and corrections.`

  // 整合超时控制：默认 30 分钟（可通过环境变量 CONSOLIDATION_TIMEOUT_MS 覆盖）
  const defaultTimeoutMs = process.env.CONSOLIDATION_TIMEOUT_MS ? parseInt(process.env.CONSOLIDATION_TIMEOUT_MS, 10) : 1800000
  const consolidationTimeout = defaultTimeoutMs

  logInfo('vision.consolidation.timeout_config', {
    resultCount: results.length,
    timeoutMs: consolidationTimeout,
    source: process.env.CONSOLIDATION_TIMEOUT_MS ? 'env' : 'default'
  })

  try {
    const consolidationResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { 'Authorization': authHeader } : {})
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are an expert at consolidating multiple circuit recognition results. Return only valid JSON.' },
          { role: 'user', content: consolidationPrompt }
        ],
        stream: false
      }),
      signal: AbortSignal.timeout(consolidationTimeout)
    })

    // 尝试读取响应文本以便更详尽地记录非 2xx 响应或用于解析
    const responseText = await consolidationResponse.text()

    if (!consolidationResponse.ok) {
      // 记录非 2xx 响应摘要，限制长度以避免日志过大
      logError('vision.consolidation.non_ok', {
        status: consolidationResponse.status,
        statusText: consolidationResponse.statusText,
        responseSnippet: responseText ? responseText.substring(0, 1000) : ''
      })
    }

    if (consolidationResponse.ok) {
      const parsed = parseVisionResponse(responseText)

      if (parsed && (Array.isArray(parsed.components) || Array.isArray(parsed.connections))) {
        logInfo('vision.consolidation.success', {
          originalResults: results.length,
          consolidatedComponents: parsed.components?.length || 0,
          consolidatedConnections: parsed.connections?.length || 0
        })

        // 记录整合成功到timeline，并保存 request/response/artifact 引用
        if (timeline) {
          try {
            const { saveArtifact } = require('./artifacts')
            // 保存 consolidation prompt
            const promptArtifact = await saveArtifact(consolidationPrompt, `consolidation_prompt_${Date.now()}`, { ext: '.txt', contentType: 'text/plain' })
            // 保存 response 文本
            const responseArtifact = await saveArtifact(responseText, `consolidation_response_${Date.now()}`, { ext: '.txt', contentType: 'text/plain' })
            // 保存解析后的 JSON
            const parsedArtifact = await saveArtifact(JSON.stringify(parsed, null, 2), `consolidation_parsed_${Date.now()}`, { ext: '.json', contentType: 'application/json' })

            const it = { step: 'recognition_consolidation_done', ts: Date.now(), meta: { type: 'ai_interaction', modelType: 'llm', resultCount: results.length, consolidatedComponents: parsed.components?.length || 0, consolidatedConnections: parsed.connections?.length || 0, description: `结果整合成功，生成${parsed.components?.length || 0}个器件和${parsed.connections?.length || 0}条连接`, requestArtifact: promptArtifact, responseArtifact: responseArtifact, parsedArtifact: parsedArtifact } }
            timeline.push(it)
            try { if (progressId) pushProgress(progressId, it) } catch {}
          } catch (e) {
            const it = { step: 'recognition_consolidation_done', ts: Date.now(), meta: { type: 'vision_consolidation', resultCount: results.length, consolidatedComponents: parsed.components?.length || 0, consolidatedConnections: parsed.connections?.length || 0, description: `结果整合成功，生成${parsed.components?.length || 0}个器件和${parsed.connections?.length || 0}条连接`, note: 'artifact save failed' } }
            timeline.push(it)
            try { if (progressId) pushProgress(progressId, it) } catch {}
          }
        }

        return parsed
      }
    }
  } catch (e) {
    logError('vision.consolidation.failed', { error: String(e) })
  }

  // 如果整合失败，返回最好的单个结果
  const bestResult = results
    .filter(r => r && Array.isArray(r.components))
    .sort((a, b) => (b.components?.length || 0) - (a.components?.length || 0))[0]

  logInfo('vision.consolidation.fallback', {
    reason: 'Consolidation failed, using best individual result',
    componentsCount: bestResult?.components?.length || 0
  })

  // 记录整合失败（使用最佳结果）到timeline
  if (timeline) {
    const it = { step: 'recognition_consolidation_fallback', ts: Date.now(), meta: { type: 'vision_consolidation', resultCount: results.length, fallbackComponents: bestResult?.components?.length || 0, fallbackConnections: bestResult?.connections?.length || 0, description: `结果整合失败，使用最佳单轮结果：${bestResult?.components?.length || 0}个器件` } }
    timeline.push(it)
    try { if (progressId) pushProgress(progressId, it) } catch {}
  }

  return bestResult || { components: [], connections: [] }
}

/**
 * 处理中文数值单位，转换为标准格式
 * @param value 中文数值字符串
 * @returns 标准化的数值字符串
 */
function processChineseValue(value: string): string {
  // 中文单位映射到标准单位
  const chineseUnitMap: { [key: string]: string } = {
    '千': 'k',
    '兆': 'M',
    '微': 'µ',
    '纳': 'n',
    '皮': 'p',
    '毫': 'm',
    '欧': 'Ω',
    '欧姆': 'Ω',
    '法': 'F',
    '法拉': 'F',
    '亨': 'H',
    '亨利': 'H',
    '伏': 'V',
    '安': 'A',
    '瓦': 'W',
    '赫': 'Hz'
  }

  let processed = value
  for (const [chinese, standard] of Object.entries(chineseUnitMap)) {
    processed = processed.replace(new RegExp(`\\b${chinese}\\b`, 'g'), standard)
  }

  return processed
}

/**
 * 计算单词的平均置信度
 * @param text 文本
 * @param words 单词识别结果
 * @returns 平均置信度
 */
function calculateWordConfidence(text: string, words: any[]): number {
  if (!words || words.length === 0) return 0.5

  // 找到与文本匹配的单词
  const matchingWords = words.filter(word =>
    text.toLowerCase().includes(word.text.toLowerCase()) ||
    word.text.toLowerCase().includes(text.toLowerCase())
  )

  if (matchingWords.length === 0) return 0.5

  // 计算平均置信度
  const totalConfidence = matchingWords.reduce((sum, word) => sum + (word.confidence || 0), 0)
  return totalConfidence / matchingWords.length
}

/**
 * 检测文本语言
 * @param text 文本
 * @returns 语言类型
 */
function detectTextLanguage(text: string): string {
  // 检查是否包含中文字符
  const chineseRegex = /[\u4e00-\u9fff]/
  if (chineseRegex.test(text)) {
    return 'chinese'
  }

  // 检查是否包含西里尔字母（俄文等）
  const cyrillicRegex = /[\u0400-\u04ff]/
  if (cyrillicRegex.test(text)) {
    return 'cyrillic'
  }

  // 默认英文
  return 'english'
}

/**
 * 图像预处理：提高OCR识别质量
 * @param imagePath 原始图像路径
 * @returns 处理后的图像路径
 */
async function preprocessImageForOCR(imagePath: string): Promise<string> {
  const ext = path.extname(imagePath).toLowerCase()
  const basename = path.basename(imagePath, ext)
  const dirname = path.dirname(imagePath)
  const processedPath = path.join(dirname, `${basename}_processed${ext}`)

  try {
    let pipeline = sharp(imagePath)

    // 获取图像信息
    const metadata = await pipeline.metadata()

    // 基本预处理流程
    pipeline = pipeline
      // 转换为灰度图，提高对比度
      .greyscale()
      // 提高对比度
      .linear(1.2, -20)
      // 轻微锐化
      .sharpen({
        sigma: 1,
        m1: 1.5,
        m2: 2,
        x1: 2,
        y2: 10,
        y3: 20
      })
      // 自适应二值化（提高文字清晰度）
      .normalise()

    // 如果图像分辨率太低，进行上采样
    if (metadata.width && metadata.width < 1000) {
      const scaleFactor = Math.min(2, 1000 / metadata.width)
      pipeline = pipeline.resize(
        Math.round(metadata.width * scaleFactor),
        Math.round((metadata.height || metadata.width) * scaleFactor),
        {
          withoutEnlargement: false,
          kernel: sharp.kernel.lanczos3
        }
      )
    }

    // 如果图像分辨率太高，进行适当降采样
    if (metadata.width && metadata.width > 4000) {
      pipeline = pipeline.resize(4000, null, {
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3
      })
    }

    // 保存处理后的图像
    await pipeline.jpeg({ quality: 95 }).toFile(processedPath)

    return processedPath

  } catch (error) {
    logError('ocr.image_preprocessing_error', { error: String(error), imagePath })
    // 如果预处理失败，返回原始路径
    return imagePath
  }
}

// 中文注释：将上游返回的 {components, connections} 规范化为 circuit-schema 所需结构
function normalizeToCircuitSchema(raw: any, images: { path: string; originalname: string }[], tStart: number): any {
  const out: any = {}
  out.components = Array.isArray(raw.components) ? raw.components : []
  // 将 connections 转换为 nets（最小可用格式）
  const nets: any[] = []
  if (Array.isArray(raw.nets)) {
    for (const n of raw.nets) {
      // 透传已有 nets
      nets.push(n)
    }
  } else if (Array.isArray(raw.connections)) {
    let idx = 1
    for (const c of raw.connections) {
      try {
        const pins: string[] = []
        // 兼容常见结构：{ from: { componentId, pin }, to: { componentId, pin }, confidence? }
        const from = c?.from
        const to = c?.to
        if (from && from.componentId && from.pin) pins.push(`${from.componentId}.${from.pin}`)
        if (to && to.componentId && to.pin) pins.push(`${to.componentId}.${to.pin}`)
        if (pins.length >= 2) {
          nets.push({ net_id: `N${idx++}`, connected_pins: Array.from(new Set(pins)), signal_type: 'signal', confidence: typeof c.confidence === 'number' ? c.confidence : 1.0 })
        }
      } catch (e) {
        // 跳过无法识别的 connection
      }
    }
  }
  out.nets = nets

  // 透传 overlay（若存在）
  if (raw.overlay) out.overlay = raw.overlay

  // 构造 metadata（最小必填）
  const tEnd = Date.now()
  const source_type = (() => {
    try {
      const anyPdf = images.some((im) => (im.originalname || '').toLowerCase().endsWith('.pdf'))
      return anyPdf ? 'pdf' : 'image'
    } catch { return 'image' }
  })()
  const overall_confidence = computeOverallConfidence(out)
  out.metadata = Object.assign({}, raw.metadata || {}, {
    source_type,
    timestamp: new Date().toISOString(),
    inference_time_ms: Math.max(0, tEnd - tStart),
    overall_confidence,
  })

  // uncertainties（如无来源，保留为空数组）
  if (Array.isArray(raw.uncertainties)) out.uncertainties = raw.uncertainties
  else out.uncertainties = []

  return out
}

// 中文注释：计算整体置信度（nets 与组件 pins 置信度的最小值；若均缺失则默认 1.0）
function computeOverallConfidence(norm: any): number {
  let confidences: number[] = []
  try {
    if (Array.isArray(norm.nets)) {
      for (const n of norm.nets) {
        if (typeof n?.confidence === 'number') confidences.push(n.confidence)
      }
    }
  } catch {}
  try {
    if (Array.isArray(norm.components)) {
      for (const c of norm.components) {
        const pins = Array.isArray(c?.pins) ? c.pins : []
        for (const p of pins) {
          if (typeof p?.confidence === 'number') confidences.push(p.confidence)
        }
      }
    }
  } catch {}
  if (!confidences.length) return 1.0
  return Math.min(...confidences.map((v) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : 1.0)))
}

// 中文注释：判断是否为IC类器件（集成电路）
function isICComponent(comp: any): boolean {
  try {
    const t = (comp?.type || '').toString().toLowerCase()
    const id = (comp?.id || '').toString().toLowerCase()
    const label = (comp?.label || '').toString().toLowerCase()

    // 明确排除的元件类型（这些不是IC）
    const excludedTypes = [
      'res', 'resistor', 'cap', 'capacitor', 'ind', 'inductor', 'ferrite',
      'led', 'diode', 'switch', 'button', 'connector', 'header', 'pin',
      'jack', 'socket', 'terminal', 'wire', 'trace', 'net', 'ground',
      'power', 'vcc', 'gnd', 'vdd', 'vss', 'via', 'pad', 'hole',
      'crystal', 'oscillator', 'transformer', 'relay', 'fuse', 'breaker'
    ]

    // 如果类型在排除列表中，直接返回false
    if (excludedTypes.some(ex => t.includes(ex))) return false

    // IC类器件的明确标识
    const icKeywords = [
      'ic', 'chip', 'integrated', 'mcu', 'microcontroller', 'processor', 'cpu',
      'pmic', 'power management', 'soc', 'system on chip', 'fpga', 'cpld',
      'adc', 'analog to digital', 'dac', 'digital to analog', 'amplifier', 'opamp', 'op-amp',
      'converter', 'regulator', 'transceiver', 'phy', 'physical layer',
      'controller', 'sensor', 'driver', 'bridge', 'interface', 'codec',
      'memory', 'ram', 'rom', 'flash', 'eeprom', 'sram', 'dram',
      'logic', 'gate', 'flip-flop', 'latch', 'multiplexer', 'demultiplexer',
      'counter', 'timer', 'pwm', 'modulator', 'demodulator'
    ]

    // 如果类型包含IC关键词，返回true
    if (icKeywords.some(k => t.includes(k) || label.includes(k))) return true

    // 检查器件编号模式（IC通常用U开头，或有特定编号模式）
    const icIdPatterns = [
      /^u\d+/i,      // U1, U2, U123等
      /^ic\d+/i,     // IC1, IC2等
      /^chip\d+/i,   // CHIP1等
      /^[a-z]+\d+[a-z]*\d*/i  // 像ATMEGA328, STM32F4等IC型号
    ]

    if (icIdPatterns.some(pattern => pattern.test(id) || pattern.test(label))) return true

    // 检查是否有引脚信息（IC通常有多个引脚）
    const pins = comp?.pins
    if (Array.isArray(pins) && pins.length >= 4) return true

    // 检查是否有复杂的参数（IC通常有型号、封装等信息）
    const params = comp?.params
    if (params && typeof params === 'object') {
      const paramKeys = Object.keys(params)
      if (paramKeys.some(key => ['package', 'model', 'part', 'manufacturer', 'vendor'].includes(key.toLowerCase()))) {
  return true
      }
    }

  } catch (e) {
    // 出错时保守处理，不当作IC
    return false
  }

  // 默认不认为是IC类器件
  return false
}

// 中文注释：为IC类器件检索 datasheet 并落盘，同时保存元数据
async function fetchAndSaveDatasheetsForICComponents(components: any[], topN: number): Promise<any[]> {
  try {
    const datasheetsDir = path.join(__dirname, '..', 'uploads', 'datasheets')
    if (!fs.existsSync(datasheetsDir)) fs.mkdirSync(datasheetsDir, { recursive: true })

    const metaItems: any[] = []
    const nowIso = new Date().toISOString()
    const tsName = nowIso.replace(/[-:]/g, '').replace(/\..+$/, 'Z')

    for (const comp of Array.isArray(components) ? components : []) {
      try {
        if (!isICComponent(comp)) continue
        const id = (comp?.id || '') as string
        const label = (comp?.label || '') as string
        const value = (comp?.value || '') as string
        const type = (comp?.type || '') as string
        // 改进搜索查询构造，使其更适合找到datasheet
        let q = ''
        if (label && label.trim()) {
          // 如果有具体的型号（如AD825, LF353），直接搜索型号 + datasheet
          q = `${label.trim()} datasheet`
        } else if (type && type.toLowerCase().includes('opamp')) {
          // 对于运算放大器，使用更通用的搜索，但不使用默认的'C'
          q = `${type} ${id} datasheet`.trim()
        } else if (id && id.trim()) {
          // 如果有器件编号，使用编号进行搜索
          q = `${id} datasheet`
        } else {
          // 如果没有任何标识信息，跳过搜索
          logInfo('vision.datasheet.skip', { component: comp, reason: 'no valid identifier found' })
          continue
        }

        // 清理查询字符串
        q = q.replace(/\s+/g, ' ').trim()
        const results = await webSearch(q, { topN })
        const first = (results.results || [])[0]

        // 记录搜索结果到日志，帮助调试
        logInfo('vision.datasheet.search', {
          component: id,
          query: q,
          resultsCount: results.results?.length || 0,
          firstResult: first ? { title: first.title, url: first.url } : null,
          provider: results.provider
        })

        let savedPath: string | null = null
        let sourceType = 'third-party'
        let docTitle = first?.title || ''
        let docDate = ''
        let confidence = 0.6
        if (first && first.url) {
          try {
            // 记录下载尝试开始
            logInfo('vision.datasheets.download.started', { component: id, url: first.url })
            const r = await fetch(first.url, { timeout: 30000 })
            if (r) {
              const status = typeof r.status === 'number' ? r.status : undefined
              if (r.ok) {
                const ct = (r.headers && r.headers.get ? (r.headers.get('content-type') || '') : '')
                const ext = ct.includes('pdf') ? 'pdf' : (ct.includes('html') ? 'html' : 'bin')
                const h = crypto.createHash('sha1').update(first.url).digest('hex').slice(0, 8)
                const safeName = `${String(id || 'C').replace(/[^A-Za-z0-9_-]/g, '')}_${tsName}_${h}.${ext}`
                const filePath = path.join(datasheetsDir, safeName)
                const buf = Buffer.from(await r.arrayBuffer())
                fs.writeFileSync(filePath, buf)
                savedPath = filePath
                // 简单来源类型推断
                const uhost = (() => { try { return new URL(first.url).hostname.toLowerCase() } catch { return '' } })()
                if (/st(\.|-)com|texas|ti\.com|analog\.com|microchip|nxp|infineon|renesas|onsemi|skyworks|nvidia|intel|amd|silabs/.test(uhost)) sourceType = 'manufacturer'
                if (/digikey|mouser|arrow|element14|farnell|rs-online|lcsc/.test(uhost)) sourceType = 'distributor'
                confidence = ct.includes('pdf') ? 0.9 : 0.7
                // 记录下载完成
                logInfo('vision.datasheets.download.completed', { component: id, url: first.url, path: savedPath, content_type: ct, http_status: status })
              } else {
                // 响应非 2xx，记录状态和少量响应体摘要
                let snippet = ''
                try {
                  const txt = await r.text()
                  snippet = String(txt).slice(0, 1024)
                } catch (e) {
                  snippet = 'could not read response body'
                }
                const reason = `http ${r.status}`
                logError('vision.datasheets.download.failed', { component: id, url: first.url, http_status: r.status, snippet })
                // 在 meta 中记录错误信息
                metaItems.push({
                  component_name: id,
                  query_string: q,
                  retrieved_at: nowIso,
                  source_url: first?.url || '',
                  source_type: sourceType,
                  document_title: docTitle,
                  document_version_or_date: docDate,
                  confidence,
                  notes: `download failed: ${reason}`,
                  http_status: r.status,
                  error_reason: snippet,
                  candidates: results.results || [],
                })
              }
            }
          } catch (e: any) {
            // 网络或其它异常，记录详细错误供诊断
            const errMsg = e && e.message ? e.message : String(e)
            const stack = e && e.stack ? e.stack : undefined
            logError('vision.datasheets.download.exception', { component: id, url: first.url, error: errMsg, stack })
            metaItems.push({
              component_name: id,
              query_string: q,
              retrieved_at: nowIso,
              source_url: first?.url || '',
              source_type: sourceType,
              document_title: docTitle,
              document_version_or_date: docDate,
              confidence,
              notes: `download exception: ${errMsg}`,
              error_reason: errMsg,
              candidates: results.results || [],
            })
          }
        }

        metaItems.push({
          component_name: id,
          query_string: q,
          retrieved_at: nowIso,
          source_url: first?.url || '',
          source_type: sourceType,
          document_title: docTitle,
          document_version_or_date: docDate,
          confidence,
          notes: savedPath ? `saved: ${savedPath}` : 'save skipped or failed',
          candidates: results.results || [],
        })
      } catch (e) {
        logError('vision.datasheets.component.error', { error: String(e) })
      }
    }

    // 聚合元数据写入单文件
    try {
      const metaPath = path.join(datasheetsDir, `metadata_${tsName}.json`)
      fs.writeFileSync(metaPath, JSON.stringify({ items: metaItems }, null, 2), { encoding: 'utf8' })
      logInfo('vision.datasheets.metadata.saved', { path: metaPath, count: metaItems.length })
    } catch (e) {
      logError('vision.datasheets.metadata.save.failed', { error: String(e) })
    }

    return metaItems
  } catch (e) {
    logError('vision.datasheets.dir.failed', { error: String(e) })
    return []
  }
}


