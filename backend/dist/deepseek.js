"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepseekTextDialog = deepseekTextDialog;
const node_fetch_1 = __importDefault(require("node-fetch"));
const url_1 = require("url");
const https_1 = __importDefault(require("https"));
const logger_1 = require("./logger");
const COMMON_PATHS = ['/chat', '/chat/completions', '/responses', '/v1/chat', '/v1/responses', '/v1/completions', '/completions'];
async function deepseekTextDialog(apiUrl, message, model, authHeader, systemPrompt, history, lang) {
    if (!apiUrl)
        throw new Error('apiUrl missing for deepseek');
    const useModel = model && String(model).trim().length > 0 ? model : 'deepseek-chat';
    // build messages: optional system prompt, optional history, then user message
    const msgs = [];
    // 优先使用传入的 systemPrompt；否则尝试从文件中加载对应语言的 SystemPrompt
    if (systemPrompt && String(systemPrompt).trim().length > 0) {
        msgs.push({ role: 'system', content: systemPrompt });
    }
    else {
        try {
            const promptLoader = require('./promptLoader').default;
            const normalizeLang = require('./promptLoader').normalizeLang;
            const nl = normalizeLang(lang);
            const sp = await promptLoader.loadPrompt(nl, 'SystemPrompt');
            if (sp && String(sp).trim())
                msgs.push({ role: 'system', content: sp });
        }
        catch (e) {
            // ignore and proceed without system prompt
        }
    }
    if (Array.isArray(history) && history.length > 0) {
        for (const h of history)
            msgs.push({ role: h.role, content: h.content });
    }
    msgs.push({ role: 'user', content: message });
    const payloadMsg = { model: useModel, messages: msgs, stream: false };
    const headers = { 'Content-Type': 'application/json' };
    if (authHeader)
        headers['Authorization'] = authHeader;
    // build try urls; for deepseek host pin to chat/completions then beta
    let urlsToTry = [];
    try {
        const u = new url_1.URL(apiUrl);
        const host = (u.hostname || '').toLowerCase();
        const isDeepseek = host.includes('deepseek.com');
        if (isDeepseek) {
            // Prefer chat/completions then beta/chat/completions
            urlsToTry.push(u.origin + '/chat/completions');
            const betaBase = u.origin + '/beta';
            urlsToTry.push(betaBase + '/chat/completions');
        }
        else {
            if (u.pathname && u.pathname !== '/') {
                urlsToTry.push(apiUrl);
            }
            else {
                for (const p of COMMON_PATHS)
                    urlsToTry.push(u.origin + p);
                urlsToTry.push(u.origin);
            }
        }
    }
    catch (e) {
        urlsToTry = [apiUrl];
    }
    // auth header variants
    const authToken = (headers['Authorization'] || '').toString().replace(/^Bearer\s+/i, '');
    const altHeaderSets = [headers];
    if (authToken) {
        const h1 = Object.assign({}, headers);
        h1['X-Api-Key'] = authToken;
        const h2 = Object.assign({}, headers);
        h2['Api-Key'] = authToken;
        altHeaderSets.push(h1, h2);
    }
    let lastErr = null;
    // Deepseek 请求超时（毫秒），可通过环境变量 DEEPSEEK_TIMEOUT_MS 覆盖，默认 1800000（30 分钟）
    const deepseekTimeout = Number(process.env.DEEPSEEK_TIMEOUT_MS || '1800000');
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
                (0, logger_1.logError)('deepseek.try.exception', { tryUrl: url, error: String(e), attempt });
                if (attempt < retries) {
                    const delay = Math.min(30000, 1000 * Math.pow(2, attempt));
                    await new Promise((res) => setTimeout(res, delay));
                    continue;
                }
            }
        }
        throw lastErr;
    }
    for (const tryUrl of urlsToTry) {
        for (const tryHeaders of altHeaderSets) {
            try {
                (0, logger_1.logInfo)('deepseek.try', { tryUrl });
                const resp = await fetchWithRetry(tryUrl, { method: 'POST', body: JSON.stringify(payloadMsg), headers: tryHeaders, timeout: deepseekTimeout }, fetchRetries);
                if (resp.ok) {
                    (0, logger_1.logInfo)('deepseek.try.success', { tryUrl, status: resp.status });
                    const txt = await resp.text();
                    try {
                        const j = JSON.parse(txt);
                        if (j.reply)
                            return j.reply;
                        if (j.text)
                            return j.text;
                        if (j.output)
                            return j.output;
                        if (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content)
                            return j.choices[0].message.content;
                    }
                    catch (e) {
                        return txt;
                    }
                }
                const txt = await resp.text();
                lastErr = `status ${resp.status} ${txt.substring(0, 200)}`;
                (0, logger_1.logError)('deepseek.try.failed', { tryUrl, status: resp.status });
            }
            catch (e) {
                lastErr = e;
                (0, logger_1.logError)('deepseek.try.exception', { tryUrl, error: String(e) });
            }
        }
    }
    throw new Error(`deepseek upstream error: ${lastErr || 'no response'}`);
}
