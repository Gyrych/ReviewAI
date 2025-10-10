import https from 'https'
import fs from 'fs'
import path from 'path'
import { loadConfig } from '../../config/config.js'

// 中文注释：最小 OpenRouter 客户端；
// - 不记录敏感头（Authorization 等）到磁盘；
// - 记录发送给上游的请求 body 与上游的原始响应到 artifacts，便于排查；
// - 提供兼容的 extractTextFromOpenAICompat 接口。

function ensureArtifactsDir(): string {
  try {
    const cfg = loadConfig()
    const artifactsDir = path.join(cfg.storageRoot, 'artifacts')
    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true })
    return artifactsDir
  } catch (e) {
    // 回退：相对路径 artifacts
    const fallback = path.resolve(process.cwd(), 'artifacts')
    try { if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true }) } catch {}
    return fallback
  }
}

async function saveArtifact(content: string | Buffer, hint: string, ext?: string): Promise<string> {
  try {
    const artifactsDir = ensureArtifactsDir()
    const ts = new Date().toISOString().replace(/[:]/g, '-')
    const safeBase = (hint || 'artifact').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
    const filename = `${ts}_${safeBase}${ext || '.json'}`
    const full = path.join(artifactsDir, filename)
    if (typeof content === 'string') fs.writeFileSync(full, content, { encoding: 'utf8' })
    else fs.writeFileSync(full, content)
    return filename
  } catch (e) {
    return ''
  }
}

export async function postJson(url: string, body: any, headers: Record<string,string>, timeoutMs: number): Promise<{ ok: boolean; status: number; text: string; headers: Record<string,string> }> {
  // 中文注释：使用 Node 原生 fetch，避免对 node-fetch 的依赖
  const fetchFn: any = (globalThis as any).fetch
  if (!fetchFn) {
    throw new Error('Fetch API not available in this runtime')
  }

  const agent = new https.Agent({ keepAlive: true, keepAliveMsecs: Number(process.env.KEEP_ALIVE_MSECS || 60000) })

  // 使用 AbortController 实现超时控制，避免请求无限挂起
  const controller = new AbortController()
  const signal = controller.signal
  const to = Number(timeoutMs || Number(process.env.LLM_TIMEOUT_MS || 120000))
  const timeoutHandle = setTimeout(() => controller.abort(), to)

  // 在发送前保存请求 body（去除敏感头）
  try {
    const bodyText = JSON.stringify(body)
    const reqFn = await saveArtifact(bodyText, 'llm_request', '.json')
    // 不把文件名记录到日志以避免泄露路径，仅用于排查时人工查阅
  } catch {}

  let resp: any
  try {
    resp = await fetchFn(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
      body: JSON.stringify(body),
      // @ts-ignore Node fetch 支持 signal
      signal,
      agent
    })
  } catch (err: any) {
    clearTimeout(timeoutHandle)
    if (err && err.name === 'AbortError') {
      // 明确的超时错误，向上游抛出可识别的信息
      throw new Error('upstream timeout')
    }
    throw err
  }
  clearTimeout(timeoutHandle)
  const text = await resp.text()
  // 在收到响应后保存原始响应文本
  try {
    await saveArtifact(String(text || ''), 'llm_response', '.json')
  } catch {}
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


