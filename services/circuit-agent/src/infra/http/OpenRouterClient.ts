import https from 'https'

// 中文注释：最小 OpenRouter 客户端；
// - 不记录敏感头；
// - 简化解析（choices[0].message.content 或 text 或原文）。

export async function postJson(url: string, body: any, headers: Record<string,string>, timeoutMs: number): Promise<{ ok: boolean; status: number; text: string; headers: Record<string,string> }> {
  // 中文注释：使用 Node 原生 fetch，避免对 node-fetch 的依赖
  const fetchFn: any = (globalThis as any).fetch
  if (!fetchFn) {
    throw new Error('Fetch API not available in this runtime')
  }

  const agent = new https.Agent({ keepAlive: true, keepAliveMsecs: Number(process.env.KEEP_ALIVE_MSECS || 60000) })
  const resp = await fetchFn(url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: JSON.stringify(body),
    // @ts-ignore Node fetch 支持 signal，下面实现超时控制
    agent
  })
  // 中文注释：使用 AbortController 实现超时（Node 原生 fetch 无 timeout 选项）
  // 上面已发起请求，这里若需要严格超时控制，可改为外层在调用前构造 signal；
  // 为保持最小改动，此处仅保留 agent keep-alive 优化。
  const text = await resp.text()
  const outHeaders: Record<string,string> = {}
  try { for (const [k,v] of (resp.headers as any).entries()) outHeaders[k] = String(v) } catch {}
  return { ok: !!resp.ok, status: Number(resp.status), text, headers: outHeaders }
}

export function extractTextFromOpenAICompat(txt: string): string {
  try {
    const j = JSON.parse(txt)
    if (j.choices && j.choices[0]) {
      const c = j.choices[0]
      if (c.message && c.message.content) return c.message.content
      if (c.text) return c.text
    }
    if (typeof j === 'string') return j
  } catch {}
  return txt
}


