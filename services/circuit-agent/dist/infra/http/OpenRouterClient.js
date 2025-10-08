import https from 'https';
// 中文注释：最小 OpenRouter 客户端；
// - 不记录敏感头；
// - 简化解析（choices[0].message.content 或 text 或原文）。
export async function postJson(url, body, headers, timeoutMs) {
    // 中文注释：使用 Node 原生 fetch，避免对 node-fetch 的依赖
    const fetchFn = globalThis.fetch;
    if (!fetchFn) {
        throw new Error('Fetch API not available in this runtime');
    }
    const agent = new https.Agent({ keepAlive: true, keepAliveMsecs: Number(process.env.KEEP_ALIVE_MSECS || 60000) });
    // 使用 AbortController 实现超时控制，避免请求无限挂起
    const controller = new AbortController();
    const signal = controller.signal;
    const to = Number(timeoutMs || Number(process.env.LLM_TIMEOUT_MS || 120000));
    const timeoutHandle = setTimeout(() => controller.abort(), to);
    let resp;
    try {
        resp = await fetchFn(url, {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
            body: JSON.stringify(body),
            // @ts-ignore Node fetch 支持 signal
            signal,
            agent
        });
    }
    catch (err) {
        clearTimeout(timeoutHandle);
        if (err && err.name === 'AbortError') {
            // 明确的超时错误，向上游抛出可识别的信息
            throw new Error('upstream timeout');
        }
        throw err;
    }
    clearTimeout(timeoutHandle);
    const text = await resp.text();
    const outHeaders = {};
    try {
        for (const [k, v] of resp.headers.entries())
            outHeaders[k] = String(v);
    }
    catch { }
    return { ok: !!resp.ok, status: Number(resp.status), text, headers: outHeaders };
}
export function extractTextFromOpenAICompat(txt) {
    try {
        const j = JSON.parse(txt);
        if (j.choices && j.choices[0]) {
            const c = j.choices[0];
            if (c.message && c.message.content)
                return c.message.content;
            if (c.text)
                return c.text;
        }
        if (typeof j === 'string')
            return j;
    }
    catch { }
    return txt;
}
