import https from 'https'

export async function postJson(url: string, body: any, headers: Record<string,string>, timeoutMs: number): Promise<{ ok: boolean; status: number; text: string; headers: Record<string,string> }> {
  const fetchFn: any = (globalThis as any).fetch
  if (!fetchFn) throw new Error('Fetch API not available in this runtime')
  const agent = new https.Agent({ keepAlive: true, keepAliveMsecs: Number(process.env.KEEP_ALIVE_MSECS || 60000) })
  const resp = await fetchFn(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: JSON.stringify(body), agent })
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


