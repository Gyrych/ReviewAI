import https from 'https'

// 中文注释：最小 OpenRouter 客户端；
// - 不记录敏感头；
// - 简化解析（choices[0].message.content 或 text 或原文）。

export async function postJson(url: string, body: any, headers: Record<string,string>, timeoutMs: number): Promise<{ ok: boolean; status: number; text: string; headers: Record<string,string> }> {
  const fetch = (await import('node-fetch')).default as any
  const agent = new https.Agent({ keepAlive: true, keepAliveMsecs: Number(process.env.KEEP_ALIVE_MSECS || 60000) })
  const resp = await fetch(url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: JSON.stringify(body),
    timeout: timeoutMs,
    agent
  })
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


