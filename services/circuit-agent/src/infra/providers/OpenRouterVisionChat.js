import { postJson, extractTextFromOpenAICompat } from '../http/OpenRouterClient.js';
// 中文注释：OpenRouter 富消息聊天（多模态）
export class OpenRouterVisionChat {
    constructor(baseUrl, defaultTimeoutMs) {
        this.baseUrl = baseUrl;
        this.defaultTimeoutMs = defaultTimeoutMs;
    }
    async chatRich(params) {
        const url = params.apiUrl || this.baseUrl;
        const timeout = params.timeoutMs || this.defaultTimeoutMs;
        const headers = Object.assign({}, params.headers || {});
        const body = { model: params.model, messages: params.messages, stream: false };
        const resp = await postJson(url, body, headers, timeout);
        if (!resp.ok)
            throw new Error(`upstream ${resp.status}`);
        const text = extractTextFromOpenAICompat(resp.text);
        return { text, raw: resp.text };
    }
}
