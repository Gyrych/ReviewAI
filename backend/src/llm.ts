import fetch from 'node-fetch'
import { URL } from 'url'
import { logInfo, logError } from './logger'

const COMMON_PATHS = ['/chat/completions', '/chat', '/responses', '/v1/chat', '/v1/responses', '/v1/completions', '/completions']

export async function generateMarkdownReview(circuitJson: any, requirements: string, specs: string, reviewGuidelines: string, apiUrl: string, model: string, authHeader?: string, systemPrompt?: string, history?: { role: string; content: string }[]): Promise<string> {
  if (!apiUrl) {
    throw new Error('apiUrl missing for LLM call')
  }
  // 构建 prompt
  const systemBase = `You are an expert circuit design reviewer. Given a JSON describing components and their connections, produce a Markdown review containing: Summary, Issues found, Suggestions, and a final verdict.`
  // Extend system prompt to mention enrichment field if present
  const enrichmentNote = `If the supplied JSON includes an \`enrichment\` field on components, these contain web search candidate sources for ambiguous parameter values. For each such parameter, evaluate the candidate sources, state which candidate appears most credible (with brief justification), and explicitly list any parameters that still require manual verification along with their candidate source URLs.`
  const system = systemPrompt && systemPrompt.trim() ? `${systemPrompt}\n\n${systemBase}\n\n${enrichmentNote}` : `${systemBase}\n\n${enrichmentNote}`
  // include history as additional context
  let historyText = ''
  if (history && Array.isArray(history) && history.length > 0) {
    historyText = '\n\nConversation history:\n'
    for (const h of history) {
      historyText += `${h.role}: ${h.content}\n`
    }
  }
  const userPrompt = `Circuit JSON:\n${JSON.stringify(circuitJson, null, 2)}\n\nDesign requirements:\n${requirements}\n\nDesign specs:\n${specs}\n\nReview guidelines:\n${reviewGuidelines}${historyText}\n\nPlease output only Markdown.`

  // 兼容常见的简单 HTTP API：发送 JSON {model, prompt/system/user} 或 {model, messages}
  const payload1 = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: userPrompt }], stream: false }
  const payload2 = { model, prompt: `${system}\n\n${userPrompt}` }

  const headers: any = { 'Content-Type': 'application/json' }
  if (authHeader) headers['Authorization'] = authHeader
  // 可选：注入 OpenRouter 推荐头（通过环境变量配置），仅在 openrouter 主机时有意义
  try {
    const uHdr = new URL(apiUrl)
    if ((uHdr.hostname || '').toLowerCase().includes('openrouter.ai')) {
      if (process && process.env && process.env.OPENROUTER_HTTP_REFERER) headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER
      if (process && process.env && process.env.OPENROUTER_X_TITLE) headers['X-Title'] = process.env.OPENROUTER_X_TITLE
    }
  } catch {}

  // 先尝试直接请求 apiUrl；如果为 base URL (没有 path) 则尝试常见路径
  let urlsToTry: string[] = []
  try {
    const u = new URL(apiUrl)
    const host = (u.hostname || '').toLowerCase()
    const pathname = u.pathname || ''
    // 专门处理 OpenRouter：若用户选择 openrouter.ai（可能传入 base path /api/v1），
    // 则优先尝试官方的 /api/v1/chat/completions 路径以及 /api/v1/chat，以提高兼容性
    if (host.includes('openrouter.ai')) {
      if (pathname && pathname !== '/') {
        // 如果传入的 apiUrl 已经是完整路径，先尝试该 URL
        urlsToTry.push(apiUrl)
      }
      urlsToTry.push(u.origin + '/api/v1/chat/completions')
      urlsToTry.push(u.origin + '/api/v1/chat')
      // 作为回退，仍尝试常见路径
      for (const p of COMMON_PATHS) urlsToTry.push(u.origin + p)
    } else {
      if (pathname && pathname !== '/') {
        urlsToTry.push(apiUrl)
      } else {
        for (const p of COMMON_PATHS) urlsToTry.push(u.origin + p)
      }
    }
  } catch (e) {
    urlsToTry = [apiUrl]
  }

  let resp: any = null
  let lastErr: any = null
  for (const tryUrl of urlsToTry) {
    try {
      logInfo('llm.try', { tryUrl: tryUrl })
      // 提升超时至 180s 以容纳大模型生成长文本的时间
      resp = await fetch(tryUrl, { method: 'POST', body: JSON.stringify(payload1), headers, timeout: 180000 })
      if (resp.ok) {
        logInfo('llm.try.success', { tryUrl: tryUrl, status: resp.status })
        break
      }
      // 尝试 prompt 形式
      resp = await fetch(tryUrl, { method: 'POST', body: JSON.stringify(payload2), headers, timeout: 180000 })
      if (resp.ok) {
        logInfo('llm.try.success', { tryUrl: tryUrl, status: resp.status })
        break
      }
      const txt = await resp.text()
      lastErr = `status ${resp.status} ${txt.substring(0,200)}`
      logError('llm.try.failed', { tryUrl: tryUrl, status: resp.status })
    } catch (e) {
      lastErr = e
      logError('llm.try.exception', { tryUrl: tryUrl, error: String(e) })
    }
  }

  if (!resp || !resp.ok) {
    throw new Error(`llm upstream error: ${lastErr || 'no response'}`)
  }

  const txt = await resp.text()
  // 如果上游返回 HTML 页面（例如 OpenRouter 返回 Model Not Found 页面），提供更友好的错误信息
  try {
    const ct = (resp.headers && resp.headers.get ? resp.headers.get('content-type') : '') || ''
    if (ct.toLowerCase().includes('text/html') || /^\s*<!doctype/i.test(txt) || txt.trim().startsWith('<html')) {
      throw new Error(`llm upstream returned HTML (likely model not available or wrong endpoint). Upstream response snippet: ${String(txt).slice(0,200)}`)
    }
    // 尝试从常见响应中抽取 Markdown
    const j = JSON.parse(txt)
    // OpenAI-like
    if (j.choices && Array.isArray(j.choices) && j.choices[0]) {
      const c = j.choices[0]
      if (c.message && c.message.content) return c.message.content
      if (c.text) return c.text
    }
    // 其他直接返回字段
    if (j.markdown) return j.markdown
    if (typeof j === 'string') return j
  } catch (e) {
    // 不是 JSON，视为纯文本 Markdown
    return txt
  }

  // 回退：文本形式
  return txt
}


