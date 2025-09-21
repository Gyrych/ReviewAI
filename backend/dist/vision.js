"use strict";
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
// 中文注释：多轮视觉识别和结果整合系统
// 支持对同一图片进行多次识别，然后通过大模型整合结果，提高识别准确性
/**
 * 从图片中提取电路JSON的主函数
 * 支持单轮和多轮识别模式
 */
async function extractCircuitJsonFromImages(images, apiUrl, model, authHeader, options, timeline) {
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
                recognitionResults = await doMultiPassRecognition(img, apiUrl, model, authHeader, recognitionPasses, timeline);
            }
            else {
                // 单轮识别模式
                const result = await recognizeSingleImage(img, apiUrl, model, authHeader);
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
    }
    // 规范化为 circuit-schema：connections -> nets，补齐 metadata/uncertainties
    const normalized = normalizeToCircuitSchema(combined, images, tStart);
    // 强制：对IC类器件进行资料检索并落盘（uploads/datasheets/）
    try {
        datasheetMeta = await fetchAndSaveDatasheetsForICComponents(normalized.components, topN);
    }
    catch (e) {
        (0, logger_1.logError)('vision.datasheets.save.failed', { error: String(e) });
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
async function recognizeSingleImage(img, apiUrl, model, authHeader) {
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
    // 主识别prompt
    const promptText = `Analyze this circuit schematic image and return a JSON object with two keys: "components" and "connections".

Each component should have:
- id: reference designator (like "U1", "R1", "C1")
- type: component type (like "op-amp", "resistor", "capacitor", "transistor")
- label: part number or model name shown on the schematic (like "AD825", "LM358", "1kΩ", "10uF")
- params: object with additional parameters
- pins: array of pin names/numbers

For connections, list nets with from/to pairs like: {"from": {"componentId": "U1", "pin": "1"}, "to": {"componentId": "R1", "pin": "1"}}

IMPORTANT: Read ALL text labels and part numbers visible on the schematic. Include the exact model numbers and values you see written next to each component.

Return only valid JSON.`;
    // 备用prompt
    const fallbackPromptText = `Look at this circuit diagram. Find all electronic components and their connections.

Return JSON like this:
{
  "components": [
    {"id": "U1", "type": "op-amp", "label": "AD825"},
    {"id": "R1", "type": "resistor", "label": "1kΩ"}
  ],
  "connections": [
    {"from": {"componentId": "U1", "pin": "1"}, "to": {"componentId": "R1", "pin": "1"}}
  ]
}

Read the text on the schematic to get the correct labels and models.`;
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
async function doMultiPassRecognition(img, apiUrl, model, authHeader, passes, timeline) {
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
                const result = await recognizeSingleImage(img, apiUrl, model, authHeader);
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
    // 构建智能整合prompt
    const consolidationPrompt = `I have ${results.length} circuit diagram recognition results from analyzing the same schematic image multiple times. Your task is to intelligently consolidate them into a single, most accurate result.

RECOGNITION RESULTS:
${results.map((result, idx) => `
=== Recognition Result ${idx + 1} ===
Component Count: ${(result.components || []).length}
Connection Count: ${(result.connections || []).length}
Components: ${JSON.stringify(result.components || [], null, 2)}
Connections: ${JSON.stringify(result.connections || [], null, 2)}
`).join('\n')}

CONSOLIDATION INSTRUCTIONS:

1. **Component Analysis**:
   - Identify ALL unique components across all results
   - For components with the same ID, merge their information intelligently
   - Prioritize results that have complete component information (id, type, label, params, pins)
   - If multiple results have different labels for the same component, choose the most specific/detailed one
   - Remove any duplicate or obviously incorrect components

2. **Connection Analysis**:
   - Combine all valid connections from different results
   - Remove duplicate connections (same from/to pairs)
   - Prioritize connections that appear in multiple results
   - Validate that connections reference existing components

3. **Quality Assessment**:
   - Prefer results with more components (indicating better recognition)
   - Favor results with more detailed component information
   - Cross-validate component labels and connection patterns
   - Remove outliers that significantly differ from the majority

4. **Data Completeness**:
   - Ensure all components have required fields: id, type
   - Include label information when available (critical for IC identification)
   - Preserve pin information for component connections
   - Include parameter information when present

5. **Conflict Resolution**:
   - For conflicting component types, choose the most common/sensible one
   - For conflicting labels, prefer manufacturer part numbers over generic names
   - For connection conflicts, keep connections that are validated by multiple results

OUTPUT FORMAT:
Return only a valid JSON object with exactly two keys:
- "components": array of consolidated component objects
- "connections": array of consolidated connection objects

Each component must have: id, type, and optionally: label, params, pins
Each connection must have: from (with componentId, pin), to (with componentId, pin)

Ensure the consolidated result represents the most accurate and complete circuit diagram recognition possible.`;
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
                const id = (comp?.id || 'C');
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
                    // 对于运算放大器，使用更通用的搜索
                    q = `${type} ${id} datasheet`;
                }
                else {
                    // 默认搜索方式
                    q = [type, label || id, value, 'datasheet'].filter(Boolean).join(' ');
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
                        const r = await (0, node_fetch_1.default)(first.url, { timeout: 30000 });
                        if (r && r.ok) {
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
                        }
                    }
                    catch (e) {
                        // 下载失败忽略
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
