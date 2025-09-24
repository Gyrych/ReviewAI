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
exports.generateMarkdownReview = generateMarkdownReview;
const node_fetch_1 = __importDefault(require("node-fetch"));
const url_1 = require("url");
const https_1 = __importDefault(require("https"));
const logger_1 = require("./logger");
const promptLoader_1 = __importStar(require("./promptLoader"));
const COMMON_PATHS = ['/chat/completions', '/chat', '/responses', '/v1/chat', '/v1/responses', '/v1/completions', '/completions'];
async function generateMarkdownReview(circuitJson, requirements, specs, apiUrl, model, authHeader, systemPrompt, history, datasheetMeta, lang) {
    if (!apiUrl) {
        throw new Error('apiUrl missing for LLM call');
    }
    // 构建 prompt：优先从外部传入 systemPrompt；否则从文件加载器读取对应语言的 SystemPrompt
    const normalizedLang = (0, promptLoader_1.normalizeLang)(lang);
    let fileSystemPrompt = '';
    try {
        fileSystemPrompt = await promptLoader_1.default.loadPrompt(normalizedLang, 'SystemPrompt');
    }
    catch (e) {
        // 若加载失败，继续使用空字符串作为回退
        fileSystemPrompt = '';
    }
    // 如果调用方传入了 systemPrompt，则以其为准；否则使用文件中的 system prompt
    const llmEnrichment = await (async () => {
        try {
            const nl = (0, promptLoader_1.normalizeLang)(normalizedLang);
            return await promptLoader_1.default.loadPrompt(nl, nl === 'zh' ? 'parts/llm_enrichment_zh' : 'parts/llm_enrichment_en');
        }
        catch {
            return '';
        }
    })();
    const finalSystemPrompt = (systemPrompt && String(systemPrompt).trim()) ? systemPrompt : fileSystemPrompt;
    // 阶段判定：若尚未确认问题（或确认后未见用户逐条回复），仅输出“【Clarifying Question】”清单；
    // 若已确认且用户回复过，则仅输出“【Review Report】”。
    function determinePhase(h) {
        try {
            const msgs = Array.isArray(h) ? h : [];
            let lastClarifyIdx = -1;
            for (let i = 0; i < msgs.length; i++) {
                const m = msgs[i];
                if (m && m.role === 'assistant' && typeof m.content === 'string' && (/【问题确认】/.test(m.content) || /【Clarifying Question】/.test(m.content))) {
                    lastClarifyIdx = i;
                }
            }
            if (lastClarifyIdx < 0)
                return 'clarify';
            // 存在澄清，则检查其后是否有用户回复
            const hasUserReplyAfter = msgs.slice(lastClarifyIdx + 1).some((m) => m && m.role === 'user' && typeof m.content === 'string' && m.content.trim().length > 0);
            return hasUserReplyAfter ? 'review' : 'clarify';
        }
        catch {
            return 'clarify';
        }
    }
    const phase = determinePhase(history);
    // 语言/前缀选择：根据最终系统提示或传入 lang 决定
    function chooseLocalePrefixes(sp, lg) {
        try {
            const txt = (sp || '').toString();
            const hasZh = /【问题确认】|【评审报告】/.test(txt) || /[\u4e00-\u9fa5]/.test(txt) || (lg === 'zh');
            if (hasZh)
                return { clarify: '【问题确认】', report: '【评审报告】', locale: 'zh' };
        }
        catch { }
        return { clarify: '【Clarifying Question】', report: '【Review Report】', locale: 'en' };
    }
    const prefixes = chooseLocalePrefixes(finalSystemPrompt, normalizedLang);
    // 尝试从提示词目录读取 phase 模板
    let phaseClarify = '';
    let phaseReport = '';
    try {
        const nl = (0, promptLoader_1.normalizeLang)(normalizedLang);
        phaseClarify = await promptLoader_1.default.loadPrompt(nl, nl === 'zh' ? 'PhaseClarify_zh' : 'PhaseClarify_en');
    }
    catch (e) {
        phaseClarify = `Output only a numbered list of clarifying questions. Each item MUST start with "${prefixes.clarify}" and be specific to the input. Do NOT include the full review or "${prefixes.report}". Avoid decorative brackets inside the body except the mandated prefix.`;
    }
    try {
        const nl = (0, promptLoader_1.normalizeLang)(normalizedLang);
        phaseReport = await promptLoader_1.default.loadPrompt(nl, nl === 'zh' ? 'PhaseReport_zh' : 'PhaseReport_en');
    }
    catch (e) {
        phaseReport = `Output the formal review only. Start with "${prefixes.report}" line, then sections in Markdown starting from ## as required by the template. Do NOT include any clarifying questions or "${prefixes.clarify}" in this stage.`;
    }
    const phaseGuard = phase === 'clarify' ? phaseClarify : phaseReport;
    // include history as additional context
    let historyText = '';
    if (history && Array.isArray(history) && history.length > 0) {
        historyText = '\n\nConversation history:\n';
        for (const h of history) {
            historyText += `${h.role}: ${h.content}\n`;
        }
    }
    // 构建IC器件资料信息
    let datasheetInfo = '';
    if (datasheetMeta && Array.isArray(datasheetMeta) && datasheetMeta.length > 0) {
        datasheetInfo = '\n\nIC Component Datasheets Retrieved:\n';
        for (const meta of datasheetMeta) {
            if (meta.component_name && meta.source_url) {
                datasheetInfo += `- ${meta.component_name}: ${meta.source_url} (confidence: ${(meta.confidence * 100).toFixed(1)}%)\n`;
            }
        }
        datasheetInfo += '\nPlease consider these datasheets when analyzing the circuit design.';
    }
    // 用户 prompt 现在从文件加载并通过 renderTemplate 注入运行时变量
    let userPromptTemplate = '';
    try {
        const nl = (0, promptLoader_1.normalizeLang)(normalizedLang);
        userPromptTemplate = await promptLoader_1.default.loadPrompt(nl, nl === 'zh' ? 'UserPrompt_zh' : 'UserPrompt_en');
    }
    catch (e) {
        userPromptTemplate = `${phaseGuard}\n\nCircuit JSON:\n${JSON.stringify(circuitJson, null, 2)}\n\nDesign requirements:\n${requirements}\n\nDesign specs:\n${specs}${datasheetInfo}${historyText}\n\nPlease output only Markdown.`;
    }
    const userPrompt = promptLoader_1.default.renderTemplate(userPromptTemplate, {
        PHASE_GUARD: phaseGuard,
        CIRCUIT_JSON: JSON.stringify(circuitJson, null, 2),
        REQUIREMENTS: requirements,
        SPECS: specs,
        DATASHEET_INFO: datasheetInfo,
        HISTORY_TEXT: historyText
    });
    // 兼容常见的简单 HTTP API：发送 JSON {model, prompt/system/user} 或 {model, messages}
    const payload1 = { model, messages: [{ role: 'system', content: finalSystemPrompt }, { role: 'user', content: userPrompt }], stream: false };
    const payload2 = { model, prompt: `${finalSystemPrompt}\n\n${userPrompt}` };
    const headers = { 'Content-Type': 'application/json' };
    if (authHeader)
        headers['Authorization'] = authHeader;
    // 可选：注入 OpenRouter 推荐头（通过环境变量配置），仅在 openrouter 主机时有意义
    try {
        const uHdr = new url_1.URL(apiUrl);
        if ((uHdr.hostname || '').toLowerCase().includes('openrouter.ai')) {
            if (process && process.env && process.env.OPENROUTER_HTTP_REFERER)
                headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER;
            if (process && process.env && process.env.OPENROUTER_X_TITLE)
                headers['X-Title'] = process.env.OPENROUTER_X_TITLE;
        }
    }
    catch { }
    // 先尝试直接请求 apiUrl；如果为 base URL (没有 path) 则尝试常见路径
    let urlsToTry = [];
    try {
        const u = new url_1.URL(apiUrl);
        const host = (u.hostname || '').toLowerCase();
        const pathname = u.pathname || '';
        // 专门处理 OpenRouter：若用户选择 openrouter.ai（可能传入 base path /api/v1），
        // 则优先尝试官方的 /api/v1/chat/completions 路径以及 /api/v1/chat，以提高兼容性
        if (host.includes('openrouter.ai')) {
            if (pathname && pathname !== '/') {
                // 如果传入的 apiUrl 已经是完整路径，先尝试该 URL
                urlsToTry.push(apiUrl);
            }
            urlsToTry.push(u.origin + '/api/v1/chat/completions');
            urlsToTry.push(u.origin + '/api/v1/chat');
            // 作为回退，仍尝试常见路径
            for (const p of COMMON_PATHS)
                urlsToTry.push(u.origin + p);
        }
        else {
            if (pathname && pathname !== '/') {
                urlsToTry.push(apiUrl);
            }
            else {
                for (const p of COMMON_PATHS)
                    urlsToTry.push(u.origin + p);
            }
        }
    }
    catch (e) {
        urlsToTry = [apiUrl];
    }
    // keep-alive agent 与重试策略
    const llmTimeout = Number(process.env.LLM_TIMEOUT_MS || '1800000');
    const fetchRetries = Number(process.env.FETCH_RETRIES || '1');
    const keepAliveAgent = new https_1.default.Agent({ keepAlive: true, keepAliveMsecs: Number(process.env.KEEP_ALIVE_MSECS || '60000') });
    async function fetchWithRetry(url, opts, retries) {
        let lastErr = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                opts.agent = opts.agent || keepAliveAgent;
                const r = await (0, node_fetch_1.default)(url, opts);
                return r;
            }
            catch (e) {
                lastErr = e;
                (0, logger_1.logError)('llm.try.exception', { tryUrl: url, error: String(e), attempt });
                if (attempt < retries) {
                    const delay = Math.min(30000, 1000 * Math.pow(2, attempt));
                    await new Promise((res) => setTimeout(res, delay));
                    continue;
                }
            }
        }
        throw lastErr;
    }
    let resp = null;
    let lastErr = null;
    for (const tryUrl of urlsToTry) {
        try {
            (0, logger_1.logInfo)('llm.try', { tryUrl: tryUrl });
            // LLM 请求超时（毫秒），可通过环境变量 LLM_TIMEOUT_MS 覆盖，默认 1800000（30 分钟）
            resp = await fetchWithRetry(tryUrl, { method: 'POST', body: JSON.stringify(payload1), headers, timeout: llmTimeout }, fetchRetries);
            if (resp.ok) {
                (0, logger_1.logInfo)('llm.try.success', { tryUrl: tryUrl, status: resp.status });
                break;
            }
            // 尝试 prompt 形式
            resp = await fetchWithRetry(tryUrl, { method: 'POST', body: JSON.stringify(payload2), headers, timeout: llmTimeout }, fetchRetries);
            if (resp.ok) {
                (0, logger_1.logInfo)('llm.try.success', { tryUrl: tryUrl, status: resp.status });
                break;
            }
            const txt = await resp.text();
            lastErr = `status ${resp.status} ${txt.substring(0, 200)}`;
            (0, logger_1.logError)('llm.try.failed', { tryUrl: tryUrl, status: resp.status });
        }
        catch (e) {
            lastErr = e;
            (0, logger_1.logError)('llm.try.exception', { tryUrl: tryUrl, error: String(e) });
        }
    }
    if (!resp || !resp.ok) {
        throw new Error(`llm upstream error: ${lastErr || 'no response'}`);
    }
    const txt = await resp.text();
    // 如果上游返回 HTML 页面（例如 OpenRouter 返回 Model Not Found 页面），提供更友好的错误信息
    try {
        const ct = (resp.headers && resp.headers.get ? resp.headers.get('content-type') : '') || '';
        if (ct.toLowerCase().includes('text/html') || /^\s*<!doctype/i.test(txt) || txt.trim().startsWith('<html')) {
            throw new Error(`llm upstream returned HTML (likely model not available or wrong endpoint). Upstream response snippet: ${String(txt).slice(0, 200)}`);
        }
        // 尝试从常见响应中抽取 Markdown
        const j = JSON.parse(txt);
        // OpenAI-like
        if (j.choices && Array.isArray(j.choices) && j.choices[0]) {
            const c = j.choices[0];
            if (c.message && c.message.content)
                return c.message.content;
            if (c.text)
                return c.text;
        }
        // 其他直接返回字段
        if (j.markdown)
            return j.markdown;
        if (typeof j === 'string')
            return j;
    }
    catch (e) {
        // 不是 JSON，视为纯文本 Markdown
        return txt;
    }
    // 回退：文本形式
    return txt;
}
