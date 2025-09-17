import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import { webSearch } from './search'
import { logInfo, logError } from './logger'

// 将图片文件转发给用户指定的模型 API，请求返回遵循 circuit schema 的 JSON
// 新增 options: enableSearch (default true), topN (default 5), saveEnriched (default true)
export async function extractCircuitJsonFromImages(images: { path: string; originalname: string }[], apiUrl: string, model: string, authHeader?: string, options?: { enableSearch?: boolean; topN?: number; saveEnriched?: boolean }): Promise<any> {
  if (!apiUrl) {
    throw new Error('apiUrl missing for vision extraction')
  }

  const enableSearch = options?.enableSearch !== false
  const topN = options?.topN || Number(process.env.SEARCH_TOPN) || 5
  const saveEnriched = options?.saveEnriched !== false

  // 对于每张图片，向 apiUrl 发送请求，要求返回遵循 schema 的 JSON
  // 注意：
  // - 对 openrouter.ai：使用 JSON 多模态消息（base64 data URL）而非 multipart
  // - 其他主机：沿用 multipart/form-data（已修复重试复用 body 的问题）
  const combined: any = { components: [], connections: [] }

  for (const img of images) {
    // 为避免在多次重试中复用同一可读流或 FormData（会导致 "body used already" 错误），
    // 我们在每次尝试发送请求时为该尝试创建新的 FormData 实例并在需要时新建 stream。
    // 优化：对于较小文件可以缓冲到内存以支持高效重试；对于大文件每次使用新的 createReadStream。
    const stat = fs.existsSync(img.path) ? fs.statSync(img.path) : null
    const fileSize = stat ? stat.size : 0
    const MEM_BUFFER_THRESHOLD = 5 * 1024 * 1024 // 5MB 阈值，可调整
    const useBuffer = fileSize > 0 && fileSize <= MEM_BUFFER_THRESHOLD
    let fileBuffer: Buffer | null = null
    if (useBuffer) {
      try {
        fileBuffer = fs.readFileSync(img.path)
      } catch (e) {
        // 如果读取失败，退回到流模式
        fileBuffer = null
      }
    }

    // 在 prompt 中指示模型返回严格的 JSON，遵循约定 schema
    const promptText = `Please analyze the circuit diagram image and return a JSON with keys: components (array), connections (array). Each component should have id,type,label,params,pins. connections should list from/to with componentId and pin. Return only JSON.`

    // 构造尝试用的 URL 列表（保持原有策略）
    let tryUrls: string[] = []
    let isOpenRouterHost = false
    try {
      const u = new URL(apiUrl)
      const host = (u.hostname || '').toLowerCase()
      isOpenRouterHost = host.includes('openrouter.ai')
      if (isOpenRouterHost) {
        if (u.pathname && u.pathname !== '/') tryUrls.push(apiUrl)
        tryUrls.push(u.origin + '/api/v1/chat/completions')
        tryUrls.push(u.origin + '/api/v1/chat')
        tryUrls.push(u.origin + '/chat/completions')
      } else {
        tryUrls.push(apiUrl)
      }
    } catch (e) {
      tryUrls.push(apiUrl)
    }

    let resp: any = null
    let lastErr: any = null
    for (const tryUrl of tryUrls) {
      let stream: any = null
      try {
        if (isOpenRouterHost) {
          // OpenRouter: 使用 JSON 多模态消息，内联 base64 图片，走 chat/completions 兼容接口
          // 估测 MIME 类型（仅用于 data URL 标注；不影响功能）
          const lower = (img.originalname || '').toLowerCase()
          let mime = 'application/octet-stream'
          if (lower.endsWith('.png')) mime = 'image/png'
          else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg'
          else if (lower.endsWith('.webp')) mime = 'image/webp'
          else if (lower.endsWith('.gif')) mime = 'image/gif'
          else if (lower.endsWith('.pdf')) mime = 'application/pdf'

          // 读取文件为 base64（为简化与可靠性，此处不限制大小；如需优化可改为分块/阈值）
          const buf = fileBuffer || fs.readFileSync(img.path)
          const dataUrl = `data:${mime};base64,${buf.toString('base64')}`

          // OpenAI/OR 兼容消息：system + user(content: [text, image_url])
          const payload = {
            model,
            messages: [
              { role: 'system', content: 'You are an expert circuit diagram parser. Return ONLY JSON with keys: components[], connections[]; no extra text.' },
              {
                role: 'user',
                content: [
                  { type: 'text', text: promptText },
                  { type: 'image_url', image_url: { url: dataUrl } },
                ],
              },
            ],
          }

          const headers: any = { 'Content-Type': 'application/json' }
          if (authHeader) headers['Authorization'] = authHeader
          // 支持可选的 OpenRouter 推荐头（通过环境变量配置）
          if (process && process.env && process.env.OPENROUTER_HTTP_REFERER) headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER
          if (process && process.env && process.env.OPENROUTER_X_TITLE) headers['X-Title'] = process.env.OPENROUTER_X_TITLE
          logInfo('vision.try', { tryUrl, mode: 'json' })
          // 显式关闭流式，并提升超时到 180s 以容纳多模态推理
          ;(payload as any).stream = false
          resp = await fetch(tryUrl, { method: 'POST', body: JSON.stringify(payload), headers, timeout: 180000 })
          if (resp.ok) {
            logInfo('vision.try.success', { tryUrl, status: resp.status })
            break
          }
          const txt = await resp.text()
          lastErr = `status ${resp.status} ${txt.substring(0,200)}`
          logError('vision.try.failed', { tryUrl, status: resp.status })
        } else {
          // 默认：multipart/form-data（图片直传）
          // 为该次尝试新建 FormData
          const form = new (require('form-data'))()
          if (fileBuffer) {
            form.append('file', fileBuffer, { filename: img.originalname })
          } else {
            stream = fs.createReadStream(img.path)
            form.append('file', stream, { filename: img.originalname })
          }
          form.append('prompt', promptText)
          form.append('model', model)

          const headers: any = Object.assign({}, form.getHeaders())
          if (authHeader) headers['Authorization'] = authHeader
          logInfo('vision.try', { tryUrl, mode: 'multipart' })
          resp = await fetch(tryUrl, { method: 'POST', body: form, headers, timeout: 30000 })
          if (resp.ok) {
            logInfo('vision.try.success', { tryUrl, status: resp.status })
            break
          }
          const txt = await resp.text()
          lastErr = `status ${resp.status} ${txt.substring(0,200)}`
          logError('vision.try.failed', { tryUrl, status: resp.status })
        }
      } catch (e) {
        lastErr = e
        logError('vision.try.exception', { tryUrl, error: String(e) })
      } finally {
        // 确保销毁本次尝试创建的流，避免资源泄露
        if (stream && typeof stream.destroy === 'function') {
          try { stream.destroy() } catch (e) { /* ignore */ }
        }
      }
    }
    if (!resp) throw new Error(`vision upstream error: ${lastErr || 'no response'}`)
    if (!resp.ok) {
      const txt = await resp.text()
      throw new Error(`vision upstream error: ${resp.status} ${txt.substring(0, 200)}`)
    }
    const txt = await resp.text()
    // 检测上游返回 HTML 的情况并给出更明确的错误提示
    const ct = (resp.headers && resp.headers.get ? resp.headers.get('content-type') : '') || ''
    if (ct.toLowerCase().includes('text/html') || /^\s*<!doctype/i.test(txt) || txt.trim().startsWith('<html')) {
      throw new Error(`vision upstream returned HTML (likely endpoint incorrect or model not found). Upstream response snippet: ${String(txt).slice(0,200)}`)
    }
    let parsed: any = null
    let wrapper: any = null
    try {
      wrapper = JSON.parse(txt)
      // OpenRouter/OpenAI 兼容：从 choices[0].message.content 中提取 JSON
      if (wrapper && wrapper.choices && Array.isArray(wrapper.choices) && wrapper.choices[0]) {
        const c = wrapper.choices[0]
        const content = (c.message && c.message.content) || c.text || ''
        if (content && typeof content === 'string') {
          const m = content.match(/\{[\s\S]*\}/)
          if (m) parsed = JSON.parse(m[0])
        }
      }
    } catch (e) {
      // 非 JSON 响应：尝试直接从文本中抽取 JSON
      const m = txt.match(/\{[\s\S]*\}/)
      if (m) {
        try { parsed = JSON.parse(m[0]) } catch (e2) { /* fallthrough */ }
      }
    }
    const j: any = parsed || wrapper

    // 合并 components 与 connections（简单拼接，未做去重）
    if (j && Array.isArray(j.components)) combined.components.push(...j.components)
    if (j && Array.isArray(j.connections)) combined.connections.push(...j.connections)
  }

  // If search enrichment is enabled, detect ambiguous params and enrich
  if (enableSearch && Array.isArray(combined.components)) {
    for (const comp of combined.components) {
      try {
        if (!comp) continue
        const params = comp.params || {}
        // Normalize params iteration for both object and array forms
        const entries: Array<[string, any]> = Array.isArray(params) ? params.map((p: any, i: number) => [String(i), p]) : Object.entries(params)
        for (const [pname, pval] of entries) {
          let ambiguous = false
          if (pval === undefined || pval === null) ambiguous = true
          else if (typeof pval === 'string') {
            const v = pval.trim().toLowerCase()
            if (v === '' || v === 'unknown' || v === 'n/a' || v === '?' || v === '—') ambiguous = true
          }
          // numeric-looking but not numeric: consider ambiguous if it's NaN when numeric expected is unclear
          if (!ambiguous) {
            // if value is a string that contains non-digit chars but expected numeric, we skip heuristic for now
          }

          if (ambiguous) {
            const qparts = []
            if (comp.type) qparts.push(comp.type)
            if (comp.label) qparts.push(comp.label)
            qparts.push(pname)
            qparts.push('datasheet')
            const query = qparts.filter(Boolean).join(' ')
            try {
              const results = await webSearch(query, { topN })
              comp.enrichment = comp.enrichment || {}
              comp.enrichment[pname] = { candidates: (results.results || []).map(r => ({ title: r.title, url: r.url, snippet: r.snippet })), queriedAt: results.fetchedAt, provider: results.provider }
              logInfo('vision.enrichment', { compId: comp.id || comp.label, param: pname, query, provider: results.provider })
            } catch (e) {
              logError('vision.enrichment.error', { error: String(e), compId: comp.id || comp.label, param: pname })
            }
          }
        }
      } catch (e) {
        logError('vision.enrichment.loop.error', { error: String(e), comp: comp })
      }
    }
  }

  // Optionally save enriched JSON to uploads for auditing
  if (saveEnriched) {
    try {
      const uploadsDir = path.join(__dirname, '..', 'uploads')
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
      const fname = `review_${new Date().toISOString().replace(/[:.]/g, '-')}.enriched.json`
      const outPath = path.join(uploadsDir, fname)
      fs.writeFileSync(outPath, JSON.stringify(combined, null, 2), { encoding: 'utf8' })
      logInfo('vision.enriched.saved', { path: outPath })
    } catch (e) {
      logError('vision.enriched.save.failed', { error: String(e) })
    }
  }

  return combined
}

