"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractCircuitJsonFromImages = extractCircuitJsonFromImages;
const node_fetch_1 = __importDefault(require("node-fetch"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const https_1 = __importDefault(require("https"));
const search_1 = require("./search");
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = require("./logger");
const promptLoader_1 = __importStar(require("./promptLoader"));
const tesseract_js_1 = require("tesseract.js");
const sharp_1 = __importDefault(require("sharp"));
// 中文注释：多轮视觉识别和结果整合系统
// 支持对同一图片进行多次识别，然后通过大模型整合结果，提高识别准确性
/**
 * 从图片中提取电路JSON的主函数
 * 支持单轮和多轮识别模式
 */
async function extractCircuitJsonFromImages(images, apiUrl, model, authHeader, options, timeline, lang) {
    if (!apiUrl) {
        throw new Error('apiUrl missing for vision extraction');
    }
    const enableSearch = options?.enableSearch !== false;
    const topN = options?.topN || Number(process.env.SEARCH_TOPN) || 5;
    const saveEnriched = options?.saveEnriched !== false;
    const multiPassRecognition = options?.multiPassRecognition === true;
    const recognitionPasses = Math.max(1, Math.min(options?.recognitionPasses || 5, 10)); // 限制在1-10次之间
    (0, logger_1.logInfo)('vision.extraction_start', {
        imageCount: images.length,
        multiPassEnabled: multiPassRecognition,
        recognitionPasses: multiPassRecognition ? recognitionPasses : 1,
        apiUrl: apiUrl.split('/').pop(), // 只记录域名部分
        model,
        enableSearch,
        topN,
        saveEnriched
    });
    // 统计信息收集
    const processingStats = {
        totalImages: images.length,
        successfulRecognitions: 0,
        failedRecognitions: 0,
        totalComponents: 0,
        totalConnections: 0,
        processingTime: 0
    };
    // 初始化IC器件资料元数据
    let datasheetMeta = [];
    const tStart = Date.now();
    const combined = { components: [], connections: [] };
    // 处理每张图片
    for (const img of images) {
        try {
            (0, logger_1.logInfo)('vision.processing_image', { filename: img.originalname });
            let recognitionResults = [];
            if (multiPassRecognition) {
                // 多轮识别模式
                recognitionResults = await doMultiPassRecognition(img, apiUrl, model, authHeader, recognitionPasses, timeline, lang);
            }
            else {
                // 单轮识别模式
                const result = await recognizeSingleImage(img, apiUrl, model, authHeader, undefined, undefined, lang);
                recognitionResults = [result];
            }
            // 如果有多轮结果，进行整合
            let finalResult;
            if (recognitionResults.length > 1) {
                finalResult = await consolidateRecognitionResults(recognitionResults, apiUrl, model, authHeader, timeline);
            }
            else {
                finalResult = recognitionResults[0];
            }
            // 合并到总结果中
            if (finalResult.components && Array.isArray(finalResult.components)) {
                combined.components.push(...finalResult.components);
            }
            if (finalResult.connections && Array.isArray(finalResult.connections)) {
                combined.connections.push(...finalResult.connections);
            }
            // 更新统计信息
            processingStats.successfulRecognitions++;
            processingStats.totalComponents += finalResult.components?.length || 0;
            processingStats.totalConnections += finalResult.connections?.length || 0;
            (0, logger_1.logInfo)('vision.image_processed', {
                filename: img.originalname,
                recognitionPasses: recognitionResults.length,
                finalComponents: finalResult.components?.length || 0,
                finalConnections: finalResult.connections?.length || 0,
                componentsWithLabels: finalResult.components?.filter((c) => c.label && c.label.trim()).length || 0
            });
        }
        catch (e) {
            processingStats.failedRecognitions++;
            (0, logger_1.logError)('vision.image_processing_failed', {
                filename: img.originalname,
                error: String(e),
                errorType: e instanceof Error ? e.constructor.name : 'Unknown'
            });
            // 继续处理其他图片，不中断整个流程
        }
    }
    // If search enrichment is enabled, detect ambiguous params and enrich
    if (enableSearch && Array.isArray(combined.components)) {
        // Record enrichment start in timeline
        if (timeline) {
            timeline.push({
                step: 'component_enrichment_start',
                ts: Date.now(),
                meta: {
                    type: 'vision_enrichment',
                    description: '开始对不明确组件参数进行网络搜索补充'
                }
            });
        }
        let enrichmentCount = 0;
        for (const comp of combined.components) {
            try {
                if (!comp)
                    continue;
                const params = comp.params || {};
                // Normalize params iteration for both object and array forms
                const entries = Array.isArray(params) ? params.map((p, i) => [String(i), p]) : Object.entries(params);
                for (const [pname, pval] of entries) {
                    let ambiguous = false;
                    if (pval === undefined || pval === null)
                        ambiguous = true;
                    else if (typeof pval === 'string') {
                        const v = pval.trim().toLowerCase();
                        if (v === '' || v === 'unknown' || v === 'n/a' || v === '?' || v === '—')
                            ambiguous = true;
                    }
                    // numeric-looking but not numeric: consider ambiguous if it's NaN when numeric expected is unclear
                    if (!ambiguous) {
                        // if value is a string that contains non-digit chars but expected numeric, we skip heuristic for now
                    }
                    if (ambiguous) {
                        const qparts = [];
                        if (comp.type)
                            qparts.push(comp.type);
                        if (comp.label)
                            qparts.push(comp.label);
                        qparts.push(pname);
                        qparts.push('datasheet');
                        const query = qparts.filter(Boolean).join(' ');
                        try {
                            const results = await (0, search_1.webSearch)(query, { topN });
                            comp.enrichment = comp.enrichment || {};
                            comp.enrichment[pname] = { candidates: (results.results || []).map(r => ({ title: r.title, url: r.url, snippet: r.snippet })), queriedAt: results.fetchedAt, provider: results.provider };
                            (0, logger_1.logInfo)('vision.enrichment', { compId: comp.id || comp.label, param: pname, query, provider: results.provider });
                            enrichmentCount++;
                        }
                        catch (e) {
                            (0, logger_1.logError)('vision.enrichment.error', { error: String(e), compId: comp.id || comp.label, param: pname });
                        }
                    }
                }
            }
            catch (e) {
                (0, logger_1.logError)('vision.enrichment.loop.error', { error: String(e), comp: comp });
            }
        }
        // Record enrichment completion in timeline
        if (timeline) {
            timeline.push({
                step: 'component_enrichment_done',
                ts: Date.now(),
                meta: {
                    type: 'vision_enrichment',
                    enrichedParametersCount: enrichmentCount,
                    description: `组件参数补充完成，共补充${enrichmentCount}个参数`
                }
            });
        }
    }
    // 集成OCR辅助识别
    let ocrResults = [];
    try {
        (0, logger_1.logInfo)('vision.ocr.start', { imageCount: images.length, enableOCR: true });
        // 记录OCR开始到timeline
        if (timeline) {
            timeline.push({
                step: 'ocr_recognition_start',
                ts: Date.now(),
                meta: {
                    type: 'vision_ocr',
                    imageCount: images.length,
                    description: `开始OCR辅助识别，共处理${images.length}张图片`
                }
            });
        }
        // 对每张图片并行进行OCR识别
        const ocrPromises = images.map(async (img) => {
            try {
                const ocrResult = await performOCRRecognition(img.path);
                (0, logger_1.logInfo)('vision.ocr.image_completed', {
                    filename: img.originalname,
                    ocrSuccess: ocrResult.success,
                    extractedComponents: ocrResult.extractedComponents?.length || 0,
                    extractedValues: ocrResult.extractedValues?.length || 0
                });
                return ocrResult;
            }
            catch (error) {
                (0, logger_1.logError)('vision.ocr.image_failed', {
                    filename: img.originalname,
                    error: String(error)
                });
                return { success: false, extractedComponents: [], extractedValues: [] };
            }
        });
        ocrResults = await Promise.all(ocrPromises);
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
        };
        // 将OCR结果与大模型结果融合
        combined.components = fuseVisionAndOCRResults(combined.components || [], mergedOCRResult);
        (0, logger_1.logInfo)('vision.ocr.fusion_completed', mergedOCRResult.ocrStats);
        // 记录OCR融合完成到timeline
        if (timeline) {
            timeline.push({
                step: 'ocr_recognition_done',
                ts: Date.now(),
                meta: {
                    type: 'vision_ocr',
                    ...mergedOCRResult.ocrStats,
                    description: `OCR辅助识别完成，提取${mergedOCRResult.ocrStats.totalExtractedComponents}个元件，${mergedOCRResult.ocrStats.totalExtractedValues}个数值`,
                    // 添加详细的OCR输出结果
                    ocrDetails: {
                        // 汇总所有图片的OCR结果
                        extractedComponents: mergedOCRResult.extractedComponents,
                        extractedValues: mergedOCRResult.extractedValues,
                        // 包含每张图片的详细识别信息
                        imageDetails: ocrResults.map((result, index) => ({
                            imageIndex: index,
                            filename: images[index]?.originalname || `image_${index + 1}`,
                            success: result.success,
                            confidence: result.confidence,
                            textLength: result.text?.length || 0,
                            extractedComponentsCount: result.extractedComponents?.length || 0,
                            extractedValuesCount: result.extractedValues?.length || 0,
                            // 精简版识别文本（避免timeline过大）
                            textPreview: result.text?.substring(0, 200) + (result.text?.length > 200 ? '...' : ''),
                            languages: result.languages
                        }))
                    }
                }
            });
        }
        // 将OCR结果添加到metadata中
        if (!combined.metadata)
            combined.metadata = {};
        combined.metadata.ocrResult = mergedOCRResult;
    }
    catch (error) {
        (0, logger_1.logError)('vision.ocr.integration_failed', {
            error: String(error),
            errorType: error instanceof Error ? error.constructor.name : 'Unknown',
            stack: error instanceof Error ? error.stack : undefined
        });
        // 记录OCR失败到timeline
        if (timeline) {
            timeline.push({
                step: 'ocr_recognition_failed',
                ts: Date.now(),
                meta: {
                    type: 'vision_ocr',
                    error: String(error),
                    description: 'OCR辅助识别失败，继续使用大模型识别结果'
                }
            });
        }
        // OCR失败不影响主流程继续
    }
    // 应用后处理校正
    const correctionResult = applyPostProcessingCorrection(combined.components || [], combined.connections || []);
    combined.components = correctionResult.components;
    // 将验证结果添加到metadata中
    if (!combined.metadata)
        combined.metadata = {};
    combined.metadata.validationResult = correctionResult.validation;
    // 规范化为 circuit-schema：connections -> nets，补齐 metadata/uncertainties
    const normalized = normalizeToCircuitSchema(combined, images, tStart);
    // 强制：对IC类器件进行资料检索并落盘（uploads/datasheets/）
    if (timeline) {
        timeline.push({
            step: 'ic_datasheet_fetch_start',
            ts: Date.now(),
            meta: {
                type: 'backend',
                description: '开始为IC器件下载datasheet资料'
            }
        });
    }
    try {
        datasheetMeta = await fetchAndSaveDatasheetsForICComponents(normalized.components, topN);
    }
    catch (e) {
        (0, logger_1.logError)('vision.datasheets.save.failed', { error: String(e) });
    }
    // 记录IC资料下载完成
    if (timeline) {
        const icCount = normalized.components?.filter((c) => {
            const t = (c?.type || '').toString().toLowerCase();
            return t.includes('ic') || t.includes('chip') || t.includes('opamp') || t.includes('op-amp');
        }).length || 0;
        timeline.push({
            step: 'ic_datasheet_fetch_done',
            ts: Date.now(),
            meta: {
                type: 'backend',
                icComponentsCount: icCount,
                datasheetsDownloaded: datasheetMeta.length,
                datasheetCount: datasheetMeta.length,
                downloadedCount: datasheetMeta.filter((item) => item.notes && item.notes.includes('saved:')).length,
                datasheets: datasheetMeta,
                description: `IC器件资料下载完成，识别出${icCount}个IC器件，下载${datasheetMeta.length}份资料`
            }
        });
    }
    // 将资料元数据添加到 normalized 对象中，以便返回给前端
    normalized.datasheetMeta = datasheetMeta;
    // Optionally save enriched JSON to uploads for auditing（命名与路径统一）
    if (saveEnriched) {
        try {
            const uploadsDir = path_1.default.join(__dirname, '..', 'uploads');
            if (!fs_1.default.existsSync(uploadsDir))
                fs_1.default.mkdirSync(uploadsDir, { recursive: true });
            const tsIso = new Date().toISOString();
            const tsName = tsIso.replace(/[:]/g, '-').replace(/\..+$/, 'Z');
            const fname = `enriched_${tsName}.json`;
            const outPath = path_1.default.join(uploadsDir, fname);
            fs_1.default.writeFileSync(outPath, JSON.stringify(normalized, null, 2), { encoding: 'utf8' });
            (0, logger_1.logInfo)('vision.enriched.saved', { path: outPath });
            // 推荐项：若 overlay 存在，额外保存 overlay 文件并登记日志
            if (normalized.overlay && normalized.overlay.svg) {
                const svgPath = path_1.default.join(uploadsDir, `overlay_${tsName.replace(/[-:]/g, '').replace('T', '_').slice(0, 15)}.svg`);
                try {
                    fs_1.default.writeFileSync(svgPath, String(normalized.overlay.svg), { encoding: 'utf8' });
                }
                catch { }
                if (normalized.overlay.mapping) {
                    const mapPath = path_1.default.join(uploadsDir, `overlay_${tsName.replace(/[-:]/g, '').replace('T', '_').slice(0, 15)}.json`);
                    try {
                        fs_1.default.writeFileSync(mapPath, JSON.stringify(normalized.overlay.mapping, null, 2), { encoding: 'utf8' });
                    }
                    catch { }
                }
            }
        }
        catch (e) {
            (0, logger_1.logError)('vision.enriched.save.failed', { error: String(e) });
        }
    }
    // 计算最终处理时间
    const tEnd = Date.now();
    processingStats.processingTime = tEnd - tStart;
    // 记录最终统计信息
    (0, logger_1.logInfo)('vision.extraction_complete', {
        ...processingStats,
        successRate: processingStats.totalImages > 0 ? (processingStats.successfulRecognitions / processingStats.totalImages * 100).toFixed(1) + '%' : '0%',
        averageComponentsPerImage: processingStats.successfulRecognitions > 0 ? (processingStats.totalComponents / processingStats.successfulRecognitions).toFixed(1) : '0',
        averageConnectionsPerImage: processingStats.successfulRecognitions > 0 ? (processingStats.totalConnections / processingStats.successfulRecognitions).toFixed(1) : '0',
        totalProcessingTimeMs: processingStats.processingTime,
        averageProcessingTimePerImage: processingStats.totalImages > 0 ? Math.round(processingStats.processingTime / processingStats.totalImages) + 'ms' : '0ms'
    });
    return normalized;
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
async function generateSpecializedPrompt(passNumber, totalPasses, lang) {
    const nl = (0, promptLoader_1.normalizeLang)(lang);
    // 第一轮：宏观识别，获取元件位置和基本类型
    if (passNumber === 1) {
        return await promptLoader_1.default.loadPrompt(nl, nl === 'zh' ? '宏观识别' : 'MacroRecognition');
    }
    // 第二轮：IC芯片专项识别，重点识别IC型号和引脚
    if (passNumber === 2 || (totalPasses >= 3 && passNumber === Math.ceil(totalPasses / 2))) {
        return await promptLoader_1.default.loadPrompt(nl, nl === 'zh' ? 'IC专项识别' : 'ICSpecialized');
    }
    // 第三轮：阻容元件专项识别，重点识别阻值和容值
    if (passNumber === 3 || (totalPasses >= 4 && passNumber === totalPasses - 1)) {
        return await promptLoader_1.default.loadPrompt(nl, nl === 'zh' ? '阻容识别' : 'ResistorCapacitor');
    }
    // 最后一轮：精细化识别和验证
    if (passNumber === totalPasses) {
        return await promptLoader_1.default.loadPrompt(nl, nl === 'zh' ? '精细化验证' : 'DetailedVerification');
    }
    // 默认使用通用识别prompt
    return await promptLoader_1.default.loadPrompt(nl, nl === 'zh' ? '通用识别' : 'GeneralRecognition');
}
/**
 * 宏观识别prompt：快速识别元件位置和基本类型
 */
// prompts migrated to files under schematic-ai-review-prompt; loader will provide them at runtime
/**
 * IC芯片专项识别prompt：重点识别IC型号和引脚信息
 */
// prompts migrated to files under schematic-ai-review-prompt; loader will provide them at runtime
/**
 * 阻容元件专项识别prompt：重点识别阻值和容值
 */
// prompts migrated to files under schematic-ai-review-prompt; loader will provide them at runtime
/**
 * 精细化验证prompt：综合验证和完善信息
 */
// prompts migrated to files under schematic-ai-review-prompt; loader will provide them at runtime
/**
 * 通用识别prompt：适用于中间轮次或默认情况
 */
// prompts migrated to files under schematic-ai-review-prompt; loader will provide them at runtime
// ========================================
// 后处理验证和校正系统
// ========================================
/**
 * 字符识别校正映射表 - 增强版，支持中英文混淆
 */
const CHARACTER_CORRECTIONS = {
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
};
/**
 * 常见IC型号映射表
 */
const COMMON_IC_MODELS = {
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
};
/**
 * 校正字符串中的字符识别错误 - 增强版，支持中英文混合
 * @param text 输入文本
 * @returns 校正后的文本
 */
function correctCharacterRecognition(text) {
    if (!text || typeof text !== 'string')
        return text;
    let corrected = text;
    // 首先处理中文数字到阿拉伯数字的转换
    const chineseNumbers = {
        '零': '0', '一': '1', '二': '2', '三': '3', '四': '4',
        '五': '5', '六': '6', '七': '7', '八': '8', '九': '9',
        '十': '10'
    };
    for (const [chinese, arabic] of Object.entries(chineseNumbers)) {
        corrected = corrected.replace(new RegExp(chinese, 'g'), arabic);
    }
    // 应用字符校正映射（保持原始大小写以避免破坏中文）
    for (const [correct, alternatives] of Object.entries(CHARACTER_CORRECTIONS)) {
        for (const alt of alternatives) {
            // 对于中文字符，使用更精确的匹配
            if (/[\u4e00-\u9fff]/.test(alt)) {
                // 中文字符：精确匹配
                corrected = corrected.replace(new RegExp(alt, 'g'), correct);
            }
            else {
                // 英文和符号：词边界匹配，避免破坏中文
                // 对特殊正则表达式字符进行转义
                const escapedAlt = alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\b${escapedAlt}\\b`, 'gi');
                corrected = corrected.replace(regex, correct);
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
    ];
    unitMappings.forEach(({ patterns, replacement }) => {
        patterns.forEach(pattern => {
            const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
            corrected = corrected.replace(regex, replacement);
        });
    });
    return corrected;
}
/**
 * 验证和校正IC型号
 * @param model 识别出的IC型号
 * @returns 校正后的型号或null（如果无法校正）
 */
function validateAndCorrectICModel(model) {
    if (!model || typeof model !== 'string')
        return null;
    const corrected = correctCharacterRecognition(model);
    // 检查是否匹配已知IC型号
    for (const [standard, variants] of Object.entries(COMMON_IC_MODELS)) {
        if (variants.some(variant => {
            // 精确匹配
            if (corrected === variant)
                return true;
            // 包含匹配
            if (corrected.includes(variant) || variant.includes(corrected))
                return true;
            // 编辑距离匹配（容忍2个字符的差异）
            if (levenshteinDistance(corrected, variant) <= 2)
                return true;
            return false;
        })) {
            return standard;
        }
    }
    // 尝试模糊匹配：查找相似的已知型号
    const bestMatch = findBestICModelMatch(corrected);
    if (bestMatch) {
        return bestMatch;
    }
    // 如果不匹配已知型号，但符合IC型号格式，也接受
    if (/^[A-Z]{2,6}\d{1,4}[A-Z0-9]*$/.test(corrected) && corrected.length >= 4) {
        return corrected;
    }
    // 如果完全不符合IC型号格式，返回null
    return null;
}
/**
 * 查找最相似的IC型号
 * @param input 输入的型号字符串
 * @returns 最相似的标准型号或null
 */
function findBestICModelMatch(input) {
    let bestMatch = null;
    let bestDistance = Infinity;
    for (const [standard, variants] of Object.entries(COMMON_IC_MODELS)) {
        for (const variant of variants) {
            const distance = levenshteinDistance(input, variant);
            if (distance < bestDistance && distance <= 3) { // 最多容忍3个字符差异
                bestDistance = distance;
                bestMatch = standard;
            }
        }
    }
    return bestMatch;
}
/**
 * 验证和校正阻值
 * @param value 识别出的阻值
 * @returns 校正后的阻值或null
 */
function validateAndCorrectResistance(value) {
    if (!value || typeof value !== 'string')
        return null;
    const corrected = correctCharacterRecognition(value);
    // 提取数值和单位
    const resistancePattern = /^(\d+(?:\.\d+)?)\s*(k|m|μ|u|µ|Ω|ohm|ohms|r)?$/i;
    const match = corrected.match(resistancePattern);
    if (!match)
        return null;
    const [, numericPart, unit] = match;
    const numValue = parseFloat(numericPart);
    // 验证数值范围（1Ω 到 10MΩ）
    if (numValue < 1 || numValue > 10000000)
        return null;
    // 标准化单位
    let standardUnit = 'Ω';
    if (unit) {
        const unitLower = unit.toLowerCase();
        if (unitLower === 'k')
            standardUnit = 'kΩ';
        else if (unitLower === 'm')
            standardUnit = 'MΩ';
        else if (unitLower.includes('μ') || unitLower.includes('u'))
            standardUnit = 'Ω'; // 微欧姆不常见，可能是错误
        else if (unitLower.includes('r'))
            standardUnit = 'Ω';
    }
    return `${numValue}${standardUnit}`;
}
/**
 * 验证和校正容值
 * @param value 识别出的容值
 * @returns 校正后的容值或null
 */
function validateAndCorrectCapacitance(value) {
    if (!value || typeof value !== 'string')
        return null;
    const corrected = correctCharacterRecognition(value);
    // 提取数值和单位
    const capacitancePattern = /^(\d+(?:\.\d+)?)\s*(p|n|μ|u|µ|m|f)?$/i;
    const match = corrected.match(capacitancePattern);
    if (!match)
        return null;
    const [, numericPart, unit] = match;
    const numValue = parseFloat(numericPart);
    // 验证数值范围（1pF 到 10000µF）
    if (numValue < 0.001 || numValue > 10000)
        return null;
    // 标准化单位
    let standardUnit = 'µF';
    if (unit) {
        const unitLower = unit.toLowerCase();
        if (unitLower === 'p')
            standardUnit = 'pF';
        else if (unitLower === 'n')
            standardUnit = 'nF';
        else if (unitLower.includes('μ') || unitLower.includes('u'))
            standardUnit = 'µF';
        else if (unitLower === 'm')
            standardUnit = 'mF';
        else if (unitLower === 'f')
            standardUnit = 'F';
    }
    return `${numValue}${standardUnit}`;
}
/**
 * 计算两个字符串之间的Levenshtein距离
 * @param str1 字符串1
 * @param str2 字符串2
 * @returns 编辑距离
 */
function levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            }
            else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // 替换
                matrix[i][j - 1] + 1, // 插入
                matrix[i - 1][j] + 1 // 删除
                );
            }
        }
    }
    return matrix[str2.length][str1.length];
}
/**
 * 验证组件值是否在合理范围内
 * @param components 所有组件列表
 * @param connections 连接信息
 * @returns 验证结果
 */
function validateComponentValues(components, connections) {
    const issues = [];
    const componentMap = new Map(components.map(c => [c.id, c]));
    // 分析电路类型
    const circuitType = analyzeCircuitType(components, connections);
    for (const comp of components) {
        if (!comp.label || !comp.type)
            continue;
        const validation = validateComponentValue(comp, circuitType, componentMap);
        if (validation.hasIssue) {
            issues.push({
                componentId: comp.id,
                issue: validation.issue,
                suggestion: validation.suggestion,
                severity: validation.severity
            });
        }
    }
    return {
        circuitType,
        issues,
        isValid: issues.length === 0
    };
}
/**
 * 分析电路类型
 * @param components 组件列表
 * @param connections 连接信息
 * @returns 电路类型分析
 */
function analyzeCircuitType(components, connections) {
    const types = components.map(c => c.type?.toLowerCase() || '').filter(Boolean);
    const labels = components.map(c => c.label?.toLowerCase() || '').filter(Boolean);
    const hasOpAmp = types.some(t => t.includes('op') || t.includes('amp'));
    const hasMCU = types.some(t => t.includes('mcu') || t.includes('micro')) ||
        labels.some(l => l.includes('stm32') || l.includes('atmega') || l.includes('pic'));
    const hasSensors = types.some(t => t.includes('sensor'));
    const hasPower = types.some(t => t.includes('power') || t.includes('regulator'));
    const hasCommunication = types.some(t => t.includes('uart') || t.includes('i2c') || t.includes('spi'));
    return {
        type: hasMCU ? 'embedded' : hasOpAmp ? 'analog' : hasSensors ? 'sensor' : 'general',
        hasOpAmp,
        hasMCU,
        hasSensors,
        hasPower,
        hasCommunication
    };
}
/**
 * 验证单个组件值
 * @param component 组件
 * @param circuitType 电路类型
 * @param componentMap 组件映射
 * @returns 验证结果
 */
function validateComponentValue(component, circuitType, componentMap) {
    const type = component.type?.toLowerCase() || '';
    const label = component.label || '';
    // 电阻验证
    if (type.includes('resistor')) {
        return validateResistanceValue(label, circuitType, component, componentMap);
    }
    // 电容验证
    if (type.includes('capacitor')) {
        return validateCapacitanceValue(label, circuitType, component, componentMap);
    }
    // IC型号验证
    if (type.includes('ic') || type.includes('chip') || type.includes('op')) {
        return validateICModel(label, circuitType);
    }
    return { hasIssue: false };
}
/**
 * 验证电阻值
 * @param value 电阻值字符串
 * @param circuitType 电路类型
 * @param component 组件
 * @param componentMap 组件映射
 * @returns 验证结果
 */
function validateResistanceValue(value, circuitType, component, componentMap) {
    const resistancePattern = /^(\d+(?:\.\d+)?)\s*(k|m|μ|u|µ|Ω|ohm|ohms|r)?$/i;
    const match = value.match(resistancePattern);
    if (!match) {
        return {
            hasIssue: true,
            issue: `Invalid resistance format: ${value}`,
            suggestion: 'Expected format: 1kΩ, 10k, 100R, etc.',
            severity: 'high'
        };
    }
    const [, numericPart, unit] = match;
    const numValue = parseFloat(numericPart);
    // 转换为欧姆
    let ohmValue = numValue;
    if (unit) {
        const unitLower = unit.toLowerCase();
        if (unitLower === 'k')
            ohmValue = numValue * 1000;
        else if (unitLower === 'm')
            ohmValue = numValue * 1000000;
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
            };
        }
        // 特殊检查：反馈电阻通常在1k-100k范围
        if (component.id?.toLowerCase().includes('f') || component.id?.toLowerCase().includes('fb')) {
            if (ohmValue < 1000 || ohmValue > 100000) {
                return {
                    hasIssue: true,
                    issue: `Feedback resistor ${value} is outside typical range`,
                    suggestion: 'Feedback resistors typically 1kΩ - 100kΩ',
                    severity: 'low'
                };
            }
        }
    }
    return { hasIssue: false };
}
/**
 * 验证电容值
 * @param value 电容值字符串
 * @param circuitType 电路类型
 * @param component 组件
 * @param componentMap 组件映射
 * @returns 验证结果
 */
function validateCapacitanceValue(value, circuitType, component, componentMap) {
    const capacitancePattern = /^(\d+(?:\.\d+)?)\s*(p|n|μ|u|µ|m|f)?$/i;
    const match = value.match(capacitancePattern);
    if (!match) {
        return {
            hasIssue: true,
            issue: `Invalid capacitance format: ${value}`,
            suggestion: 'Expected format: 10nF, 1µF, 100pF, etc.',
            severity: 'high'
        };
    }
    const [, numericPart, unit] = match;
    const numValue = parseFloat(numericPart);
    // 转换为微法
    let ufValue = numValue;
    if (unit) {
        const unitLower = unit.toLowerCase();
        if (unitLower === 'p')
            ufValue = numValue / 1000000;
        else if (unitLower === 'n')
            ufValue = numValue / 1000;
        else if (unitLower === 'm')
            ufValue = numValue * 1000;
        else if (unitLower === 'f')
            ufValue = numValue * 1000000;
    }
    // 合理性检查
    if (ufValue < 0.000001 || ufValue > 10000) { // 1pF 到 10000µF
        return {
            hasIssue: true,
            issue: `Capacitance ${value} (${ufValue}µF) is outside typical range`,
            suggestion: 'Typical range: 1pF - 10000µF',
            severity: 'medium'
        };
    }
    return { hasIssue: false };
}
/**
 * 验证IC型号
 * @param model IC型号
 * @param circuitType 电路类型
 * @returns 验证结果
 */
function validateICModel(model, circuitType) {
    // 这里可以添加基于电路类型的IC验证逻辑
    // 例如，模拟电路通常使用运算放大器，嵌入式电路使用MCU等
    if (!model || model.length < 3) {
        return {
            hasIssue: true,
            issue: `IC model too short or empty: ${model}`,
            suggestion: 'IC models should be at least 3 characters',
            severity: 'high'
        };
    }
    // 检查是否符合IC型号格式
    if (!/^[A-Z0-9]{3,20}$/i.test(model)) {
        return {
            hasIssue: true,
            issue: `IC model format invalid: ${model}`,
            suggestion: 'IC models should contain only letters and numbers',
            severity: 'medium'
        };
    }
    return { hasIssue: false };
}
/**
 * 应用后处理验证和校正到识别结果
 * @param components 识别出的组件列表
 * @param connections 连接信息
 * @returns 校正后的组件列表和验证结果
 */
function applyPostProcessingCorrection(components, connections) {
    // 首先应用字符校正
    let correctedComponents = components.map(comp => {
        const corrected = { ...comp };
        // 确保params对象存在
        if (!corrected.params) {
            corrected.params = {};
        }
        // 校正IC型号
        if (comp.type && (comp.type.toLowerCase().includes('ic') || comp.type.toLowerCase().includes('chip') || comp.type.toLowerCase().includes('opamp') || comp.type.toLowerCase().includes('op-amp')) && comp.label) {
            const correctedModel = validateAndCorrectICModel(comp.label);
            if (correctedModel && correctedModel !== comp.label) {
                corrected.label = correctedModel;
                corrected.params.originalLabel = comp.label;
                corrected.params.corrected = true;
                corrected.params.correctionReason = 'IC model validation';
            }
        }
        // 校正电阻值
        if (comp.type && comp.type.toLowerCase().includes('resistor') && comp.label) {
            const correctedValue = validateAndCorrectResistance(comp.label);
            if (correctedValue && correctedValue !== comp.label) {
                corrected.label = correctedValue;
                corrected.params.originalLabel = comp.label;
                corrected.params.corrected = true;
                corrected.params.correctionReason = 'Resistance value validation';
            }
        }
        // 校正电容值
        if (comp.type && comp.type.toLowerCase().includes('capacitor') && comp.label) {
            const correctedValue = validateAndCorrectCapacitance(comp.label);
            if (correctedValue && correctedValue !== comp.label) {
                corrected.label = correctedValue;
                corrected.params.originalLabel = comp.label;
                corrected.params.corrected = true;
                corrected.params.correctionReason = 'Capacitance value validation';
            }
        }
        return corrected;
    });
    // 然后进行数值合理性验证
    const validationResult = validateComponentValues(correctedComponents, connections || []);
    return {
        components: correctedComponents,
        validation: validationResult
    };
}
// ========================================
// OCR辅助识别系统
// ========================================
/**
 * 使用OCR识别图片中的文本，作为大模型识别的补充
 * @param imagePath 图片路径
 * @returns OCR识别结果
 */
async function performOCRRecognition(imagePath) {
    let worker = null;
    let processedImagePath = imagePath;
    try {
        (0, logger_1.logInfo)('ocr.start', { imagePath });
        // 图像预处理：提高识别质量
        try {
            processedImagePath = await preprocessImageForOCR(imagePath);
            (0, logger_1.logInfo)('ocr.preprocessing_completed', { originalPath: imagePath, processedPath: processedImagePath });
        }
        catch (preprocessError) {
            (0, logger_1.logError)('ocr.preprocessing_failed', { error: String(preprocessError) });
            // 如果预处理失败，使用原始图像
            processedImagePath = imagePath;
        }
        // 创建Tesseract worker并加载多语言支持
        worker = await (0, tesseract_js_1.createWorker)();
        // 配置OCR参数以提高识别精度
        await worker.setParameters({
            tessedit_pageseg_mode: '6', // 统一文本块
            tessedit_ocr_engine_mode: '2', // 使用LSTM OCR引擎
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789Ωµμ°±×÷=+-()[]{}.,;:\'"|&@#$%^&*!?<>~/\\` 欧姆微法纳皮千兆赫赫兹伏安瓦瓦特法拉千瓦时分贝摄氏华氏节拍每分钟每秒每米立方米升毫升立方厘米立方毫米立方微米立方纳米立方皮米立方飞米立方仄米立方幺米', // 扩展字符白名单，包含电路常用符号
            tessedit_char_blacklist: '', // 不设置黑名单
            textord_min_linesize: 2.5, // 最小线条大小
        });
        // 多语言支持：尝试加载简体中文、繁体中文和英文的组合
        let loadedLanguages = [];
        const languageOptions = [
            'chi_sim+chi_tra+eng', // 简体+繁体+英文
            'chi_sim+eng', // 简体+英文
            'chi_tra+eng', // 繁体+英文
            'chi_sim+chi_tra', // 简体+繁体
            'chi_sim', // 仅简体中文
            'chi_tra', // 仅繁体中文
            'eng' // 仅英文
        ];
        for (const langOption of languageOptions) {
            try {
                await worker.loadLanguage(langOption);
                await worker.initialize(langOption);
                loadedLanguages = langOption.split('+');
                (0, logger_1.logInfo)('ocr.language_loaded', { language: langOption, languages: loadedLanguages });
                break; // 成功加载，跳出循环
            }
            catch (langError) {
                (0, logger_1.logError)('ocr.language_load_failed', { language: langOption, error: String(langError) });
                continue; // 尝试下一个语言选项
            }
        }
        if (loadedLanguages.length === 0) {
            throw new Error('Failed to load any language pack for OCR');
        }
        // 进行OCR识别，使用更高的精度设置
        const { data: { text, words, confidence } } = await worker.recognize(processedImagePath, {
            rotateAuto: true, // 自动旋转检测
        });
        (0, logger_1.logInfo)('ocr.completed', {
            imagePath,
            processedPath: processedImagePath,
            textLength: text.length,
            wordCount: words.length,
            confidence: confidence.toFixed(2),
            languages: loadedLanguages.join('+')
        });
        // 解析识别结果，提取可能的元件标记
        const ocrResults = parseOCRText(text, words);
        return {
            success: true,
            confidence,
            text,
            words,
            languages: loadedLanguages,
            extractedComponents: ocrResults.components,
            extractedValues: ocrResults.values
        };
    }
    catch (error) {
        (0, logger_1.logError)('ocr.failed', {
            imagePath,
            error: String(error)
        });
        return {
            success: false,
            error: String(error),
            extractedComponents: [],
            extractedValues: []
        };
    }
    finally {
        // 清理worker
        if (worker) {
            try {
                await worker.terminate();
            }
            catch (e) {
                // 忽略清理错误
            }
        }
        // 清理预处理图像（如果与原始图像不同）
        if (processedImagePath !== imagePath && fs_1.default.existsSync(processedImagePath)) {
            try {
                fs_1.default.unlinkSync(processedImagePath);
                (0, logger_1.logInfo)('ocr.cleanup_processed_image', { processedPath: processedImagePath });
            }
            catch (e) {
                // 忽略清理错误
            }
        }
    }
}
/**
 * 解析OCR识别的文本，提取元件相关信息
 * @param text 完整识别文本
 * @param words 单词级识别结果
 * @returns 解析后的元件信息
 */
function parseOCRText(text, words) {
    const components = [];
    const values = [];
    // 清理文本，保留中文字符
    const cleanText = text.replace(/\s+/g, ' ').trim();
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
    ];
    // 查找元件标识符
    componentPatterns.forEach(pattern => {
        const matches = cleanText.match(pattern);
        if (matches) {
            matches.forEach(match => {
                const component = parseComponentFromText(match, cleanText);
                if (component) {
                    components.push(component);
                }
            });
        }
    });
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
    ];
    // 查找数值
    valuePatterns.forEach(pattern => {
        const matches = cleanText.match(pattern);
        if (matches) {
            matches.forEach(match => {
                const processedValue = processChineseValue(match.trim());
                values.push({
                    value: processedValue,
                    original: match.trim(),
                    type: inferValueType(processedValue),
                    confidence: calculateWordConfidence(match, words), // 基于单词置信度
                    language: detectTextLanguage(match) // 检测语言
                });
            });
        }
    });
    return {
        components,
        values: [...new Set(values.map(v => v.value))].map(val => values.find(v => v.value === val))
    };
}
/**
 * 从文本中解析元件信息
 * @param componentId 元件标识符
 * @param contextText 上下文文本
 * @returns 元件信息
 */
function parseComponentFromText(componentId, contextText) {
    // 查找该元件附近的数值或型号信息
    const idPattern = new RegExp(`\\b${componentId}\\b.*?([A-Z0-9]+(?:[ΩµμkMnpuF\\.]+)?)`, 'gi');
    const match = contextText.match(idPattern);
    if (match && match[1]) {
        const value = match[1].trim();
        return {
            id: componentId.toUpperCase(),
            type: inferComponentType(componentId),
            label: value,
            source: 'ocr',
            confidence: 0.6
        };
    }
    return {
        id: componentId.toUpperCase(),
        type: inferComponentType(componentId),
        source: 'ocr',
        confidence: 0.5
    };
}
/**
 * 根据元件标识符推断元件类型
 * @param componentId 元件标识符
 * @returns 元件类型
 */
function inferComponentType(componentId) {
    const id = componentId.toUpperCase();
    if (id.startsWith('U') || id.startsWith('IC'))
        return 'ic';
    if (id.startsWith('R'))
        return 'resistor';
    if (id.startsWith('C'))
        return 'capacitor';
    if (id.startsWith('L'))
        return 'inductor';
    if (id.startsWith('D'))
        return 'diode';
    if (id.startsWith('Q'))
        return 'transistor';
    if (id.startsWith('J'))
        return 'connector';
    return 'unknown';
}
/**
 * 推断数值的类型
 * @param value 数值字符串
 * @returns 数值类型
 */
function inferValueType(value) {
    const lowerValue = value.toLowerCase();
    // 检查是否包含电阻单位
    if (lowerValue.includes('k') || lowerValue.includes('m') || lowerValue.includes('ω') || lowerValue.includes('ohm') || lowerValue.includes('r')) {
        return 'resistance';
    }
    // 检查是否包含电容单位
    if (lowerValue.includes('p') || lowerValue.includes('n') || lowerValue.includes('μ') || lowerValue.includes('u') || lowerValue.includes('µ') || lowerValue.includes('f')) {
        return 'capacitance';
    }
    // 检查是否是IC型号格式
    if (/^[A-Z]{2,6}\d{1,4}[A-Z0-9]*$/.test(value.toUpperCase())) {
        return 'ic_model';
    }
    return 'unknown';
}
/**
 * 将OCR结果与大模型结果进行融合
 * @param visionComponents 大模型识别的组件
 * @param ocrResult OCR识别结果
 * @returns 融合后的组件列表
 */
function fuseVisionAndOCRResults(visionComponents, ocrResult) {
    if (!ocrResult.success || !ocrResult.extractedComponents) {
        return visionComponents;
    }
    const fusedComponents = [...visionComponents];
    // 为每个大模型识别的组件寻找OCR补充信息
    visionComponents.forEach(visionComp => {
        // 查找匹配的OCR组件
        const matchingOCRComp = ocrResult.extractedComponents.find((ocrComp) => {
            const vid = (visionComp && typeof visionComp.id === 'string') ? visionComp.id : '';
            const oid = (ocrComp && typeof ocrComp.id === 'string') ? ocrComp.id : '';
            if (!vid && !oid)
                return false;
            if (vid && oid && vid === oid)
                return true;
            return (vid && oid) ? vid.toLowerCase() === oid.toLowerCase() : false;
        });
        if (matchingOCRComp) {
            // 如果OCR有更具体的标签信息，添加到params中作为候选
            if (matchingOCRComp.label && matchingOCRComp.label !== visionComp.label) {
                if (!visionComp.params)
                    visionComp.params = {};
                if (!visionComp.params.ocrCandidates)
                    visionComp.params.ocrCandidates = [];
                visionComp.params.ocrCandidates.push({
                    source: 'ocr',
                    label: matchingOCRComp.label,
                    confidence: matchingOCRComp.confidence,
                    timestamp: new Date().toISOString()
                });
            }
        }
    });
    // 添加OCR独有的组件（如果大模型没有识别到）
    ocrResult.extractedComponents.forEach((ocrComp) => {
        const existsInVision = visionComponents.some((vc) => {
            const vid = (vc && typeof vc.id === 'string') ? vc.id : '';
            const oid = (ocrComp && typeof ocrComp.id === 'string') ? ocrComp.id : '';
            if (!vid && !oid)
                return false;
            if (vid && oid && vid === oid)
                return true;
            return (vid && oid) ? vid.toLowerCase() === oid.toLowerCase() : false;
        });
        if (!existsInVision && ocrComp.confidence > 0.5) {
            // 标记为OCR发现的组件
            ocrComp.params = {
                ...ocrComp.params,
                discoveredBy: 'ocr',
                confidence: ocrComp.confidence
            };
            fusedComponents.push(ocrComp);
        }
    });
    return fusedComponents;
}
// ========================================
// 多轮识别分析和优化
// ========================================
/**
 * 分析各轮次识别结果的特点和权重
 * @param results 多轮识别结果数组
 * @returns 各轮次的分析信息
 */
function analyzeRecognitionPasses(results) {
    const passes = [];
    results.forEach((result, idx) => {
        const passNumber = idx + 1;
        const totalPasses = results.length;
        let specialization = 'general';
        let strategy = 'General recognition';
        let focus = 'All components and connections';
        let weight = 'medium';
        // 根据轮次确定专业化方向
        if (passNumber === 1) {
            specialization = 'macro';
            strategy = 'Macro recognition - component locations and basic types';
            focus = 'Component positions, types, and basic connections';
            weight = 'medium';
        }
        else if (passNumber === 2 || (totalPasses >= 3 && passNumber === Math.ceil(totalPasses / 2))) {
            specialization = 'IC-focused';
            strategy = 'IC specialized recognition - model numbers and pins';
            focus = 'IC chips, model numbers, manufacturer prefixes, pin information';
            weight = 'high';
        }
        else if (passNumber === 3 || (totalPasses >= 4 && passNumber === totalPasses - 1)) {
            specialization = 'RC-focused';
            strategy = 'Resistor/Capacitor specialized recognition - values and parameters';
            focus = 'Component values, units, tolerances, voltage ratings';
            weight = 'high';
        }
        else if (passNumber === totalPasses) {
            specialization = 'verification';
            strategy = 'Verification pass - cross-validation and error correction';
            focus = 'Data validation, error correction, completeness check';
            weight = 'high';
        }
        // 分析结果质量指标
        const components = result.components || [];
        const connections = result.connections || [];
        const qualityMetrics = {
            totalComponents: components.length,
            totalConnections: connections.length,
            componentsWithLabels: components.filter((c) => c.label && c.label.trim()).length,
            componentsWithValues: components.filter((c) => {
                const label = (c.label || '').toLowerCase();
                return /\d/.test(label) && (label.includes('k') || label.includes('m') || label.includes('µ') || label.includes('u') || label.includes('n') || label.includes('p') || label.includes('ω') || label.includes('ohm'));
            }).length,
            icComponents: components.filter((c) => {
                const type = (c.type || '').toLowerCase();
                const label = (c.label || '').toUpperCase();
                return type.includes('ic') || type.includes('chip') || type.includes('op') || /^[A-Z]{2,4}\d/.test(label);
            }).length,
            componentsWithPins: components.filter((c) => Array.isArray(c.pins) && c.pins.length > 0).length
        };
        passes.push({
            passNumber,
            specialization,
            strategy,
            focus,
            weight,
            qualityMetrics
        });
    });
    return {
        totalPasses: results.length,
        passes,
        summary: `Analysis of ${results.length} recognition passes with specialized strategies for different component types`
    };
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
async function recognizeSingleImage(img, apiUrl, model, authHeader, passNumber, recognitionPasses, lang) {
    const visionTimeout = Number(process.env.VISION_TIMEOUT_MS || '1800000');
    const fetchRetries = Number(process.env.FETCH_RETRIES || '1');
    const keepAliveAgent = new https_1.default.Agent({ keepAlive: true, keepAliveMsecs: Number(process.env.KEEP_ALIVE_MSECS || '60000') });
    // 准备文件缓冲 - 内存优化
    const stat = fs_1.default.existsSync(img.path) ? fs_1.default.statSync(img.path) : null;
    const fileSize = stat ? stat.size : 0;
    const MEM_BUFFER_THRESHOLD = 5 * 1024 * 1024; // 5MB阈值
    const useBuffer = fileSize > 0 && fileSize <= MEM_BUFFER_THRESHOLD;
    let fileBuffer = null;
    if (useBuffer) {
        try {
            fileBuffer = fs_1.default.readFileSync(img.path);
            (0, logger_1.logInfo)('vision.file_buffered', {
                filename: img.originalname,
                fileSize: fileSize + ' bytes',
                useBuffer: true
            });
        }
        catch (e) {
            fileBuffer = null;
            (0, logger_1.logError)('vision.file_buffer_failed', {
                filename: img.originalname,
                error: String(e)
            });
        }
    }
    else {
        (0, logger_1.logInfo)('vision.file_streaming', {
            filename: img.originalname,
            fileSize: fileSize + ' bytes',
            useBuffer: false,
            reason: fileSize > MEM_BUFFER_THRESHOLD ? 'file too large' : 'file not accessible'
        });
    }
    // 根据识别阶段生成专业的电子元件识别prompt
    const promptText = await generateSpecializedPrompt(passNumber || 1, recognitionPasses || 1, lang);
    // 备用prompt（通用识别）
    // 备用 prompt 从文件加载（如不存在则使用内置 fallback 文件）
    let fallbackPromptText = '';
    try {
        const nl = (0, promptLoader_1.normalizeLang)(lang);
        fallbackPromptText = await promptLoader_1.default.loadPrompt(nl, 'fallbacks/FallbackPrompt_en');
    }
    catch (e) {
        // 本地回退内容
        fallbackPromptText = `Look at this circuit diagram. Find all electronic components and their connections.\n\nReturn JSON like this:\n{\n  \"components\": [\n    {\"id\": \"U1\", \"type\": \"op-amp\", \"label\": \"AD825\"},\n    {\"id\": \"R1\", \"type\": \"resistor\", \"label\": \"1kΩ\"}\n  ],\n  \"connections\": [\n    {\"from\": {\"componentId\": \"U1\", \"pin\": \"1\"}, \"to\": {\"componentId\": \"R1\", \"pin\": \"1\"}}\n  ]\n}\n\nRead the text on the schematic to get the correct labels and models.`;
    }
    // 构造尝试URL列表
    let tryUrls = [];
    let isOpenRouterHost = false;
    try {
        const u = new URL(apiUrl);
        const host = (u.hostname || '').toLowerCase();
        isOpenRouterHost = host.includes('openrouter.ai');
        if (isOpenRouterHost) {
            if (u.pathname && u.pathname !== '/')
                tryUrls.push(apiUrl);
            tryUrls.push(u.origin + '/api/v1/chat/completions');
            tryUrls.push(u.origin + '/api/v1/chat');
            tryUrls.push(u.origin + '/chat/completions');
        }
        else {
            tryUrls.push(apiUrl);
        }
    }
    catch (e) {
        tryUrls.push(apiUrl);
    }
    // 带重试的fetch函数
    const fetchWithRetryLocal = async (url, opts, retries) => {
        let lastErr = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                opts.agent = opts.agent || keepAliveAgent;
                const r = await (0, node_fetch_1.default)(url, opts);
                return r;
            }
            catch (e) {
                lastErr = e;
                (0, logger_1.logError)('vision.fetch.retry', { url, attempt, error: String(e) });
                if (attempt < retries) {
                    const delay = Math.min(30000, 1000 * Math.pow(2, attempt));
                    await new Promise((res) => setTimeout(res, delay));
                }
            }
        }
        throw lastErr;
    };
    // 主要识别尝试
    let result = await performRecognitionAttempt(img, tryUrls, isOpenRouterHost, promptText, model, authHeader, fileBuffer, visionTimeout, fetchRetries, fetchWithRetryLocal);
    // 如果主要尝试失败，尝试备用prompt
    if (!result || (!Array.isArray(result.components) && !Array.isArray(result.connections))) {
        (0, logger_1.logInfo)('vision.trying_fallback', { filename: img.originalname });
        result = await performRecognitionAttempt(img, tryUrls, isOpenRouterHost, fallbackPromptText, model, authHeader, fileBuffer, visionTimeout, fetchRetries, fetchWithRetryLocal);
    }
    // 最终验证结果
    if (!result || (!Array.isArray(result.components) && !Array.isArray(result.connections))) {
        (0, logger_1.logError)('vision.recognition_failed', {
            filename: img.originalname,
            result: result
        });
        return { components: [], connections: [] };
    }
    return result;
}
/**
 * 执行单次识别尝试
 */
async function performRecognitionAttempt(img, tryUrls, isOpenRouterHost, promptText, model, authHeader, fileBuffer, visionTimeout, fetchRetries, fetchWithRetryLocal) {
    for (const tryUrl of tryUrls) {
        let stream = null;
        try {
            let resp = null;
            if (isOpenRouterHost) {
                // OpenRouter JSON模式
                const lower = (img.originalname || '').toLowerCase();
                let mime = 'application/octet-stream';
                if (lower.endsWith('.png'))
                    mime = 'image/png';
                else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg'))
                    mime = 'image/jpeg';
                else if (lower.endsWith('.webp'))
                    mime = 'image/webp';
                else if (lower.endsWith('.gif'))
                    mime = 'image/gif';
                else if (lower.endsWith('.pdf'))
                    mime = 'application/pdf';
                const buf = fileBuffer || fs_1.default.readFileSync(img.path);
                const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
                // 尝试从 prompt 文件加载 parser 的 system 提示（根据语言环境）
                let parserSystem = '';
                try {
                    const lang = (0, promptLoader_1.normalizeLang)(process.env.DEFAULT_PROMPT_LANG || 'zh');
                    parserSystem = await promptLoader_1.default.loadPrompt(lang, 'ParserSystem');
                }
                catch (e) {
                    parserSystem = 'You are an expert circuit diagram parser. Return ONLY JSON with keys: components[], connections[]; no extra text.';
                }
                const payload = {
                    model,
                    messages: [
                        { role: 'system', content: parserSystem },
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: promptText },
                                { type: 'image_url', image_url: { url: dataUrl } },
                            ],
                        },
                    ],
                };
                const headers = { 'Content-Type': 'application/json' };
                if (authHeader)
                    headers['Authorization'] = authHeader;
                if (process?.env?.OPENROUTER_HTTP_REFERER)
                    headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER;
                if (process?.env?.OPENROUTER_X_TITLE)
                    headers['X-Title'] = process.env.OPENROUTER_X_TITLE;
                payload.stream = false;
                resp = await fetchWithRetryLocal(tryUrl, { method: 'POST', body: JSON.stringify(payload), headers, timeout: visionTimeout }, fetchRetries);
            }
            else {
                // Multipart模式
                const form = new (require('form-data'))();
                if (fileBuffer) {
                    form.append('file', fileBuffer, { filename: img.originalname });
                }
                else {
                    stream = fs_1.default.createReadStream(img.path);
                    form.append('file', stream, { filename: img.originalname });
                }
                form.append('prompt', promptText);
                form.append('model', model);
                const headers = Object.assign({}, form.getHeaders());
                if (authHeader)
                    headers['Authorization'] = authHeader;
                resp = await fetchWithRetryLocal(tryUrl, { method: 'POST', body: form, headers, timeout: visionTimeout }, fetchRetries);
            }
            if (!resp || !resp.ok) {
                (0, logger_1.logError)('vision.attempt_failed', { tryUrl, status: resp?.status });
                continue;
            }
            const txt = await resp.text();
            const parsed = parseVisionResponse(txt);
            if (parsed && (Array.isArray(parsed.components) || Array.isArray(parsed.connections))) {
                (0, logger_1.logInfo)('vision.attempt_success', { tryUrl, filename: img.originalname });
                return parsed;
            }
        }
        catch (e) {
            (0, logger_1.logError)('vision.attempt_exception', { tryUrl, filename: img.originalname, error: String(e) });
        }
        finally {
            if (stream && typeof stream.destroy === 'function') {
                try {
                    stream.destroy();
                }
                catch (e) { /* ignore */ }
            }
        }
    }
    return null;
}
/**
 * 解析视觉模型响应
 */
function parseVisionResponse(txt) {
    // 检测HTML响应
    const ct = 'application/json'; // 简化处理
    if (txt.includes('<html') || txt.includes('<!doctype')) {
        throw new Error(`vision upstream returned HTML`);
    }
    let parsed = null;
    let wrapper = null;
    try {
        wrapper = JSON.parse(txt);
        // OpenRouter/OpenAI兼容：从choices[0].message.content提取JSON
        if (wrapper && wrapper.choices && Array.isArray(wrapper.choices) && wrapper.choices[0]) {
            const c = wrapper.choices[0];
            const content = (c.message && c.message.content) || c.text || '';
            if (content && typeof content === 'string') {
                // 尝试多种方式提取JSON
                let jsonMatch = content.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    jsonMatch = content.match(/(?:\{[\s\S]*"components"[\s\S]*\}|\{[\s\S]*"connections"[\s\S]*\})/);
                }
                if (!jsonMatch && content.includes('components')) {
                    const start = content.indexOf('{');
                    const lastBrace = content.lastIndexOf('}');
                    if (start >= 0 && lastBrace > start) {
                        const potentialJson = content.substring(start, lastBrace + 1);
                        try {
                            parsed = JSON.parse(potentialJson);
                        }
                        catch (e) {
                            // 继续尝试其他方法
                        }
                    }
                }
                if (jsonMatch && !parsed) {
                    parsed = JSON.parse(jsonMatch[0]);
                }
            }
        }
    }
    catch (e) {
        // 非JSON响应：尝试直接从文本中抽取JSON
        const m = txt.match(/\{[\s\S]*\}/);
        if (m) {
            try {
                parsed = JSON.parse(m[0]);
            }
            catch (e2) { /* fallthrough */ }
        }
    }
    return parsed || wrapper;
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
async function doMultiPassRecognition(img, apiUrl, model, authHeader, passes, timeline, lang) {
    const results = [];
    const startTime = Date.now();
    (0, logger_1.logInfo)('vision.multi_pass.start', {
        filename: img.originalname,
        totalPasses: passes
    });
    // 记录多轮识别开始到timeline
    if (timeline) {
        timeline.push({
            step: 'multi_pass_recognition_start',
            ts: startTime,
            meta: {
                type: 'vision_multi_pass',
                totalPasses: passes,
                description: `开始多轮视觉识别，共${passes}轮`
            }
        });
    }
    // 性能优化：根据passes数量动态调整并发度
    // passes <= 3: 并发度1（避免过度并行）
    // passes 4-6: 并发度2
    // passes > 6: 并发度3（最大并发度）
    const maxConcurrent = passes <= 3 ? 1 : passes <= 6 ? 2 : 3;
    const batches = [];
    for (let i = 0; i < passes; i += maxConcurrent) {
        batches.push(Array.from({ length: Math.min(maxConcurrent, passes - i) }, (_, idx) => idx + i));
    }
    (0, logger_1.logInfo)('vision.multi_pass.concurrency', {
        filename: img.originalname,
        maxConcurrent,
        batchCount: batches.length
    });
    for (const batch of batches) {
        const batchPromises = batch.map(async (passIndex) => {
            const passNumber = passIndex + 1;
            (0, logger_1.logInfo)('vision.multi_pass.attempt', {
                filename: img.originalname,
                pass: passNumber,
                totalPasses: passes
            });
            try {
                const result = await recognizeSingleImage(img, apiUrl, model, authHeader, passNumber, passes, lang);
                // 为结果添加轮次标识
                if (result.components) {
                    result.components.forEach((comp) => {
                        if (!comp.params)
                            comp.params = {};
                        comp.params._recognitionPass = passNumber;
                    });
                }
                (0, logger_1.logInfo)('vision.multi_pass.result', {
                    filename: img.originalname,
                    pass: passNumber,
                    componentsCount: result.components?.length || 0,
                    connectionsCount: result.connections?.length || 0
                });
                return result;
            }
            catch (e) {
                (0, logger_1.logError)('vision.multi_pass.error', {
                    filename: img.originalname,
                    pass: passNumber,
                    error: String(e)
                });
                return { components: [], connections: [] };
            }
        });
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
    }
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    (0, logger_1.logInfo)('vision.multi_pass.complete', {
        filename: img.originalname,
        totalResults: results.length,
        successfulResults: results.filter(r => (r.components?.length || 0) + (r.connections?.length || 0) > 0).length,
        totalProcessingTime: totalTime + 'ms',
        averageTimePerPass: results.length > 0 ? Math.round(totalTime / results.length) + 'ms' : '0ms'
    });
    // 记录多轮识别完成到timeline
    if (timeline) {
        timeline.push({
            step: 'multi_pass_recognition_done',
            ts: endTime,
            meta: {
                type: 'vision_multi_pass',
                totalPasses: passes,
                successfulPasses: results.filter(r => (r.components?.length || 0) + (r.connections?.length || 0) > 0).length,
                totalProcessingTime: totalTime,
                averageTimePerPass: results.length > 0 ? Math.round(totalTime / results.length) : 0,
                description: `多轮视觉识别完成，${results.length}轮中有${results.filter(r => (r.components?.length || 0) + (r.connections?.length || 0) > 0).length}轮成功`
            }
        });
    }
    return results;
}
/**
 * 整合多轮识别结果，通过大模型进行智能整合
 * @param results 多轮识别结果数组
 * @param apiUrl API地址
 * @param model 模型名称
 * @param authHeader 认证头
 * @returns 整合后的最终结果
 */
async function consolidateRecognitionResults(results, apiUrl, model, authHeader, timeline) {
    if (results.length === 0) {
        return { components: [], connections: [] };
    }
    if (results.length === 1) {
        return results[0];
    }
    (0, logger_1.logInfo)('vision.consolidation.start', {
        totalResults: results.length
    });
    // 记录结果整合开始到timeline
    if (timeline) {
        timeline.push({
            step: 'recognition_consolidation_start',
            ts: Date.now(),
            meta: {
                type: 'vision_consolidation',
                resultCount: results.length,
                description: `开始整合${results.length}个识别结果`
            }
        });
    }
    // 分析各轮次的识别特点和权重
    const passAnalysis = analyzeRecognitionPasses(results);
    // 构建智能整合prompt（可从文件载入并以运行时数据渲染）
    let consolidationTemplate = '';
    try {
        const lang = (0, promptLoader_1.normalizeLang)(process.env.DEFAULT_PROMPT_LANG || 'zh');
        consolidationTemplate = await promptLoader_1.default.loadPrompt(lang, 'Consolidation');
    }
    catch (e) {
        consolidationTemplate = `I have {{RESULT_COUNT}} specialized circuit diagram recognition results from analyzing the same schematic image with different recognition strategies. Your task is to intelligently consolidate them into a single, most accurate result.\n\nRECOGNITION PASS ANALYSIS:\n{{PASS_SUMMARY}}\n\nPass Details:\n{{PASS_DETAILS}}\n\nRECOGNITION RESULTS:\n{{RESULTS_BLOCK}}\n\nSPECIALIZED CONSOLIDATION INSTRUCTIONS:\n1. IC Component Priority ...`; // truncated fallback
    }
    const consolidationPrompt = (0, promptLoader_1.renderTemplate)(consolidationTemplate, {
        RESULT_COUNT: results.length,
        PASS_SUMMARY: passAnalysis.summary,
        PASS_DETAILS: passAnalysis.passes.map((p, idx) => `Pass ${idx + 1}: ${p.specialization} (${p.weight} priority) - ${p.strategy}`).join('\n'),
        RESULTS_BLOCK: results.map((result, idx) => {
            const passInfo = passAnalysis.passes[idx];
            return `=== Recognition Pass ${idx + 1} (${passInfo.specialization}) ===\nStrategy: ${passInfo.strategy}\nFocus: ${passInfo.focus}\nWeight: ${passInfo.weight}\nComponent Count: ${(result.components || []).length}\nConnection Count: ${(result.connections || []).length}\nComponents: ${JSON.stringify(result.components || [], null, 2)}\nConnections: ${JSON.stringify(result.connections || [], null, 2)}`;
        }).join('\n')
    });
    // 整合超时控制：根据输入结果数量动态调整
    const consolidationTimeout = Math.max(30000, Math.min(120000, results.length * 15000)); // 30秒到2分钟，根据结果数量调整
    (0, logger_1.logInfo)('vision.consolidation.timeout_config', {
        resultCount: results.length,
        timeoutMs: consolidationTimeout
    });
    try {
        const consolidationResponse = await (0, node_fetch_1.default)(apiUrl, {
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
        });
        if (consolidationResponse.ok) {
            const responseText = await consolidationResponse.text();
            const parsed = parseVisionResponse(responseText);
            if (parsed && (Array.isArray(parsed.components) || Array.isArray(parsed.connections))) {
                (0, logger_1.logInfo)('vision.consolidation.success', {
                    originalResults: results.length,
                    consolidatedComponents: parsed.components?.length || 0,
                    consolidatedConnections: parsed.connections?.length || 0
                });
                // 记录整合成功到timeline
                if (timeline) {
                    timeline.push({
                        step: 'recognition_consolidation_done',
                        ts: Date.now(),
                        meta: {
                            type: 'vision_consolidation',
                            resultCount: results.length,
                            consolidatedComponents: parsed.components?.length || 0,
                            consolidatedConnections: parsed.connections?.length || 0,
                            description: `结果整合成功，生成${parsed.components?.length || 0}个器件和${parsed.connections?.length || 0}条连接`
                        }
                    });
                }
                return parsed;
            }
        }
    }
    catch (e) {
        (0, logger_1.logError)('vision.consolidation.failed', { error: String(e) });
    }
    // 如果整合失败，返回最好的单个结果
    const bestResult = results
        .filter(r => r && Array.isArray(r.components))
        .sort((a, b) => (b.components?.length || 0) - (a.components?.length || 0))[0];
    (0, logger_1.logInfo)('vision.consolidation.fallback', {
        reason: 'Consolidation failed, using best individual result',
        componentsCount: bestResult?.components?.length || 0
    });
    // 记录整合失败（使用最佳结果）到timeline
    if (timeline) {
        timeline.push({
            step: 'recognition_consolidation_fallback',
            ts: Date.now(),
            meta: {
                type: 'vision_consolidation',
                resultCount: results.length,
                fallbackComponents: bestResult?.components?.length || 0,
                fallbackConnections: bestResult?.connections?.length || 0,
                description: `结果整合失败，使用最佳单轮结果：${bestResult?.components?.length || 0}个器件`
            }
        });
    }
    return bestResult || { components: [], connections: [] };
}
/**
 * 处理中文数值单位，转换为标准格式
 * @param value 中文数值字符串
 * @returns 标准化的数值字符串
 */
function processChineseValue(value) {
    // 中文单位映射到标准单位
    const chineseUnitMap = {
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
    };
    let processed = value;
    for (const [chinese, standard] of Object.entries(chineseUnitMap)) {
        processed = processed.replace(new RegExp(`\\b${chinese}\\b`, 'g'), standard);
    }
    return processed;
}
/**
 * 计算单词的平均置信度
 * @param text 文本
 * @param words 单词识别结果
 * @returns 平均置信度
 */
function calculateWordConfidence(text, words) {
    if (!words || words.length === 0)
        return 0.5;
    // 找到与文本匹配的单词
    const matchingWords = words.filter(word => text.toLowerCase().includes(word.text.toLowerCase()) ||
        word.text.toLowerCase().includes(text.toLowerCase()));
    if (matchingWords.length === 0)
        return 0.5;
    // 计算平均置信度
    const totalConfidence = matchingWords.reduce((sum, word) => sum + (word.confidence || 0), 0);
    return totalConfidence / matchingWords.length;
}
/**
 * 检测文本语言
 * @param text 文本
 * @returns 语言类型
 */
function detectTextLanguage(text) {
    // 检查是否包含中文字符
    const chineseRegex = /[\u4e00-\u9fff]/;
    if (chineseRegex.test(text)) {
        return 'chinese';
    }
    // 检查是否包含西里尔字母（俄文等）
    const cyrillicRegex = /[\u0400-\u04ff]/;
    if (cyrillicRegex.test(text)) {
        return 'cyrillic';
    }
    // 默认英文
    return 'english';
}
/**
 * 图像预处理：提高OCR识别质量
 * @param imagePath 原始图像路径
 * @returns 处理后的图像路径
 */
async function preprocessImageForOCR(imagePath) {
    const ext = path_1.default.extname(imagePath).toLowerCase();
    const basename = path_1.default.basename(imagePath, ext);
    const dirname = path_1.default.dirname(imagePath);
    const processedPath = path_1.default.join(dirname, `${basename}_processed${ext}`);
    try {
        let pipeline = (0, sharp_1.default)(imagePath);
        // 获取图像信息
        const metadata = await pipeline.metadata();
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
            .normalise();
        // 如果图像分辨率太低，进行上采样
        if (metadata.width && metadata.width < 1000) {
            const scaleFactor = Math.min(2, 1000 / metadata.width);
            pipeline = pipeline.resize(Math.round(metadata.width * scaleFactor), Math.round((metadata.height || metadata.width) * scaleFactor), {
                withoutEnlargement: false,
                kernel: sharp_1.default.kernel.lanczos3
            });
        }
        // 如果图像分辨率太高，进行适当降采样
        if (metadata.width && metadata.width > 4000) {
            pipeline = pipeline.resize(4000, null, {
                withoutEnlargement: true,
                kernel: sharp_1.default.kernel.lanczos3
            });
        }
        // 保存处理后的图像
        await pipeline.jpeg({ quality: 95 }).toFile(processedPath);
        return processedPath;
    }
    catch (error) {
        (0, logger_1.logError)('ocr.image_preprocessing_error', { error: String(error), imagePath });
        // 如果预处理失败，返回原始路径
        return imagePath;
    }
}
// 中文注释：将上游返回的 {components, connections} 规范化为 circuit-schema 所需结构
function normalizeToCircuitSchema(raw, images, tStart) {
    const out = {};
    out.components = Array.isArray(raw.components) ? raw.components : [];
    // 将 connections 转换为 nets（最小可用格式）
    const nets = [];
    if (Array.isArray(raw.nets)) {
        for (const n of raw.nets) {
            // 透传已有 nets
            nets.push(n);
        }
    }
    else if (Array.isArray(raw.connections)) {
        let idx = 1;
        for (const c of raw.connections) {
            try {
                const pins = [];
                // 兼容常见结构：{ from: { componentId, pin }, to: { componentId, pin }, confidence? }
                const from = c?.from;
                const to = c?.to;
                if (from && from.componentId && from.pin)
                    pins.push(`${from.componentId}.${from.pin}`);
                if (to && to.componentId && to.pin)
                    pins.push(`${to.componentId}.${to.pin}`);
                if (pins.length >= 2) {
                    nets.push({ net_id: `N${idx++}`, connected_pins: Array.from(new Set(pins)), signal_type: 'signal', confidence: typeof c.confidence === 'number' ? c.confidence : 1.0 });
                }
            }
            catch (e) {
                // 跳过无法识别的 connection
            }
        }
    }
    out.nets = nets;
    // 透传 overlay（若存在）
    if (raw.overlay)
        out.overlay = raw.overlay;
    // 构造 metadata（最小必填）
    const tEnd = Date.now();
    const source_type = (() => {
        try {
            const anyPdf = images.some((im) => (im.originalname || '').toLowerCase().endsWith('.pdf'));
            return anyPdf ? 'pdf' : 'image';
        }
        catch {
            return 'image';
        }
    })();
    const overall_confidence = computeOverallConfidence(out);
    out.metadata = Object.assign({}, raw.metadata || {}, {
        source_type,
        timestamp: new Date().toISOString(),
        inference_time_ms: Math.max(0, tEnd - tStart),
        overall_confidence,
    });
    // uncertainties（如无来源，保留为空数组）
    if (Array.isArray(raw.uncertainties))
        out.uncertainties = raw.uncertainties;
    else
        out.uncertainties = [];
    return out;
}
// 中文注释：计算整体置信度（nets 与组件 pins 置信度的最小值；若均缺失则默认 1.0）
function computeOverallConfidence(norm) {
    let confidences = [];
    try {
        if (Array.isArray(norm.nets)) {
            for (const n of norm.nets) {
                if (typeof n?.confidence === 'number')
                    confidences.push(n.confidence);
            }
        }
    }
    catch { }
    try {
        if (Array.isArray(norm.components)) {
            for (const c of norm.components) {
                const pins = Array.isArray(c?.pins) ? c.pins : [];
                for (const p of pins) {
                    if (typeof p?.confidence === 'number')
                        confidences.push(p.confidence);
                }
            }
        }
    }
    catch { }
    if (!confidences.length)
        return 1.0;
    return Math.min(...confidences.map((v) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : 1.0)));
}
// 中文注释：判断是否为IC类器件（集成电路）
function isICComponent(comp) {
    try {
        const t = (comp?.type || '').toString().toLowerCase();
        const id = (comp?.id || '').toString().toLowerCase();
        const label = (comp?.label || '').toString().toLowerCase();
        // 明确排除的元件类型（这些不是IC）
        const excludedTypes = [
            'res', 'resistor', 'cap', 'capacitor', 'ind', 'inductor', 'ferrite',
            'led', 'diode', 'switch', 'button', 'connector', 'header', 'pin',
            'jack', 'socket', 'terminal', 'wire', 'trace', 'net', 'ground',
            'power', 'vcc', 'gnd', 'vdd', 'vss', 'via', 'pad', 'hole',
            'crystal', 'oscillator', 'transformer', 'relay', 'fuse', 'breaker'
        ];
        // 如果类型在排除列表中，直接返回false
        if (excludedTypes.some(ex => t.includes(ex)))
            return false;
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
        ];
        // 如果类型包含IC关键词，返回true
        if (icKeywords.some(k => t.includes(k) || label.includes(k)))
            return true;
        // 检查器件编号模式（IC通常用U开头，或有特定编号模式）
        const icIdPatterns = [
            /^u\d+/i, // U1, U2, U123等
            /^ic\d+/i, // IC1, IC2等
            /^chip\d+/i, // CHIP1等
            /^[a-z]+\d+[a-z]*\d*/i // 像ATMEGA328, STM32F4等IC型号
        ];
        if (icIdPatterns.some(pattern => pattern.test(id) || pattern.test(label)))
            return true;
        // 检查是否有引脚信息（IC通常有多个引脚）
        const pins = comp?.pins;
        if (Array.isArray(pins) && pins.length >= 4)
            return true;
        // 检查是否有复杂的参数（IC通常有型号、封装等信息）
        const params = comp?.params;
        if (params && typeof params === 'object') {
            const paramKeys = Object.keys(params);
            if (paramKeys.some(key => ['package', 'model', 'part', 'manufacturer', 'vendor'].includes(key.toLowerCase()))) {
                return true;
            }
        }
    }
    catch (e) {
        // 出错时保守处理，不当作IC
        return false;
    }
    // 默认不认为是IC类器件
    return false;
}
// 中文注释：为IC类器件检索 datasheet 并落盘，同时保存元数据
async function fetchAndSaveDatasheetsForICComponents(components, topN) {
    try {
        const datasheetsDir = path_1.default.join(__dirname, '..', 'uploads', 'datasheets');
        if (!fs_1.default.existsSync(datasheetsDir))
            fs_1.default.mkdirSync(datasheetsDir, { recursive: true });
        const metaItems = [];
        const nowIso = new Date().toISOString();
        const tsName = nowIso.replace(/[-:]/g, '').replace(/\..+$/, 'Z');
        for (const comp of Array.isArray(components) ? components : []) {
            try {
                if (!isICComponent(comp))
                    continue;
                const id = (comp?.id || '');
                const label = (comp?.label || '');
                const value = (comp?.value || '');
                const type = (comp?.type || '');
                // 改进搜索查询构造，使其更适合找到datasheet
                let q = '';
                if (label && label.trim()) {
                    // 如果有具体的型号（如AD825, LF353），直接搜索型号 + datasheet
                    q = `${label.trim()} datasheet`;
                }
                else if (type && type.toLowerCase().includes('opamp')) {
                    // 对于运算放大器，使用更通用的搜索，但不使用默认的'C'
                    q = `${type} ${id} datasheet`.trim();
                }
                else if (id && id.trim()) {
                    // 如果有器件编号，使用编号进行搜索
                    q = `${id} datasheet`;
                }
                else {
                    // 如果没有任何标识信息，跳过搜索
                    (0, logger_1.logInfo)('vision.datasheet.skip', { component: comp, reason: 'no valid identifier found' });
                    continue;
                }
                // 清理查询字符串
                q = q.replace(/\s+/g, ' ').trim();
                const results = await (0, search_1.webSearch)(q, { topN });
                const first = (results.results || [])[0];
                // 记录搜索结果到日志，帮助调试
                (0, logger_1.logInfo)('vision.datasheet.search', {
                    component: id,
                    query: q,
                    resultsCount: results.results?.length || 0,
                    firstResult: first ? { title: first.title, url: first.url } : null,
                    provider: results.provider
                });
                let savedPath = null;
                let sourceType = 'third-party';
                let docTitle = first?.title || '';
                let docDate = '';
                let confidence = 0.6;
                if (first && first.url) {
                    try {
                        // 记录下载尝试开始
                        (0, logger_1.logInfo)('vision.datasheets.download.started', { component: id, url: first.url });
                        const r = await (0, node_fetch_1.default)(first.url, { timeout: 30000 });
                        if (r) {
                            const status = typeof r.status === 'number' ? r.status : undefined;
                            if (r.ok) {
                                const ct = (r.headers && r.headers.get ? (r.headers.get('content-type') || '') : '');
                                const ext = ct.includes('pdf') ? 'pdf' : (ct.includes('html') ? 'html' : 'bin');
                                const h = crypto_1.default.createHash('sha1').update(first.url).digest('hex').slice(0, 8);
                                const safeName = `${String(id || 'C').replace(/[^A-Za-z0-9_-]/g, '')}_${tsName}_${h}.${ext}`;
                                const filePath = path_1.default.join(datasheetsDir, safeName);
                                const buf = Buffer.from(await r.arrayBuffer());
                                fs_1.default.writeFileSync(filePath, buf);
                                savedPath = filePath;
                                // 简单来源类型推断
                                const uhost = (() => { try {
                                    return new URL(first.url).hostname.toLowerCase();
                                }
                                catch {
                                    return '';
                                } })();
                                if (/st(\.|-)com|texas|ti\.com|analog\.com|microchip|nxp|infineon|renesas|onsemi|skyworks|nvidia|intel|amd|silabs/.test(uhost))
                                    sourceType = 'manufacturer';
                                if (/digikey|mouser|arrow|element14|farnell|rs-online|lcsc/.test(uhost))
                                    sourceType = 'distributor';
                                confidence = ct.includes('pdf') ? 0.9 : 0.7;
                                // 记录下载完成
                                (0, logger_1.logInfo)('vision.datasheets.download.completed', { component: id, url: first.url, path: savedPath, content_type: ct, http_status: status });
                            }
                            else {
                                // 响应非 2xx，记录状态和少量响应体摘要
                                let snippet = '';
                                try {
                                    const txt = await r.text();
                                    snippet = String(txt).slice(0, 1024);
                                }
                                catch (e) {
                                    snippet = 'could not read response body';
                                }
                                const reason = `http ${r.status}`;
                                (0, logger_1.logError)('vision.datasheets.download.failed', { component: id, url: first.url, http_status: r.status, snippet });
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
                                });
                            }
                        }
                    }
                    catch (e) {
                        // 网络或其它异常，记录详细错误供诊断
                        const errMsg = e && e.message ? e.message : String(e);
                        const stack = e && e.stack ? e.stack : undefined;
                        (0, logger_1.logError)('vision.datasheets.download.exception', { component: id, url: first.url, error: errMsg, stack });
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
                        });
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
                });
            }
            catch (e) {
                (0, logger_1.logError)('vision.datasheets.component.error', { error: String(e) });
            }
        }
        // 聚合元数据写入单文件
        try {
            const metaPath = path_1.default.join(datasheetsDir, `metadata_${tsName}.json`);
            fs_1.default.writeFileSync(metaPath, JSON.stringify({ items: metaItems }, null, 2), { encoding: 'utf8' });
            (0, logger_1.logInfo)('vision.datasheets.metadata.saved', { path: metaPath, count: metaItems.length });
        }
        catch (e) {
            (0, logger_1.logError)('vision.datasheets.metadata.save.failed', { error: String(e) });
        }
        return metaItems;
    }
    catch (e) {
        (0, logger_1.logError)('vision.datasheets.dir.failed', { error: String(e) });
        return [];
    }
}
