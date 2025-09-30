import { postJson, extractTextFromOpenAICompat } from '../http/OpenRouterClient.js';
export class OpenRouterTextProvider {
    constructor(baseUrl, defaultTimeoutMs) {
        this.baseUrl = baseUrl;
        this.defaultTimeoutMs = defaultTimeoutMs;
    }
    async chat(params) {
        const url = params.apiUrl || this.baseUrl;
        const headers = Object.assign({}, params.headers || {});
        const msgs = [];
        if (params.system && params.system.trim())
            msgs.push({ role: 'system', content: params.system });
        for (const m of params.messages || [])
            msgs.push({ role: m.role, content: m.content });
        const body = { model: params.model, messages: msgs, stream: false };
        const resp = await postJson(url, body, headers, params.timeoutMs || this.defaultTimeoutMs);
        if (!resp.ok)
            throw new Error(`upstream ${resp.status}`);
        const text = extractTextFromOpenAICompat(resp.text);
        return { text, raw: resp.text };
    }
}
