import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import https from 'https'
import { webSearch } from './search'
import crypto from 'crypto'
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
  const tStart = Date.now()
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

    // 超时时间（毫秒），可通过环境变量 VISION_TIMEOUT_MS 覆盖，默认 1800000（30 分钟）
    const visionTimeout = Number(process.env.VISION_TIMEOUT_MS || '1800000')
    const fetchRetries = Number(process.env.FETCH_RETRIES || '1')
    // keep-alive agent 提升连接稳定性（默认 keepAlive true）
    const keepAliveAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: Number(process.env.KEEP_ALIVE_MSECS || '60000') })

    // 辅助函数：带重试与 keep-alive 的 fetch
    async function fetchWithRetry(url: string, opts: any, retries: number) {
      let lastErr: any = null
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          // 注入 agent 以启用 keep-alive
          opts.agent = opts.agent || keepAliveAgent
          const r = await fetch(url, opts)
          return r
        } catch (e) {
          lastErr = e
          logError('vision.try.exception', { tryUrl: url, error: String(e), attempt })
          if (attempt < retries) {
            // 指数退避
            const delay = Math.min(30000, 1000 * Math.pow(2, attempt))
            await new Promise((res) => setTimeout(res, delay))
            continue
          }
        }
      }
      throw lastErr
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
          resp = await fetchWithRetry(tryUrl, { method: 'POST', body: JSON.stringify(payload), headers, timeout: visionTimeout }, fetchRetries)
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
          // 使用与 JSON 分支一致的超时配置
          resp = await fetchWithRetry(tryUrl, { method: 'POST', body: form, headers, timeout: visionTimeout }, fetchRetries)
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

  // 规范化为 circuit-schema：connections -> nets，补齐 metadata/uncertainties
  const normalized = normalizeToCircuitSchema(combined, images, tStart)

  // 强制：对关键器件进行资料检索并落盘（uploads/datasheets/）
  try {
    await fetchAndSaveDatasheetsForKeyComponents(normalized.components, topN)
  } catch (e) {
    logError('vision.datasheets.save.failed', { error: String(e) })
  }

  // Optionally save enriched JSON to uploads for auditing（命名与路径统一）
  if (saveEnriched) {
    try {
      const uploadsDir = path.join(__dirname, '..', 'uploads')
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
      const tsIso = new Date().toISOString()
      const tsName = tsIso.replace(/[:]/g, '-').replace(/\..+$/, 'Z')
      const fname = `enriched_${tsName}.json`
      const outPath = path.join(uploadsDir, fname)
      fs.writeFileSync(outPath, JSON.stringify(normalized, null, 2), { encoding: 'utf8' })
      logInfo('vision.enriched.saved', { path: outPath })

      // 推荐项：若 overlay 存在，额外保存 overlay 文件并登记日志
      if ((normalized as any).overlay && (normalized as any).overlay.svg) {
        const svgPath = path.join(uploadsDir, `overlay_${tsName.replace(/[-:]/g, '').replace('T', '_').slice(0, 15)}.svg`)
        try { fs.writeFileSync(svgPath, String((normalized as any).overlay.svg), { encoding: 'utf8' }) } catch {}
        if ((normalized as any).overlay.mapping) {
          const mapPath = path.join(uploadsDir, `overlay_${tsName.replace(/[-:]/g, '').replace('T', '_').slice(0, 15)}.json`)
          try { fs.writeFileSync(mapPath, JSON.stringify((normalized as any).overlay.mapping, null, 2), { encoding: 'utf8' }) } catch {}
        }
      }
    } catch (e) {
      logError('vision.enriched.save.failed', { error: String(e) })
    }
  }

  return normalized
}

// 中文注释：将上游返回的 {components, connections} 规范化为 circuit-schema 所需结构
function normalizeToCircuitSchema(raw: any, images: { path: string; originalname: string }[], tStart: number): any {
  const out: any = {}
  out.components = Array.isArray(raw.components) ? raw.components : []
  // 将 connections 转换为 nets（最小可用格式）
  const nets: any[] = []
  if (Array.isArray(raw.nets)) {
    for (const n of raw.nets) {
      // 透传已有 nets
      nets.push(n)
    }
  } else if (Array.isArray(raw.connections)) {
    let idx = 1
    for (const c of raw.connections) {
      try {
        const pins: string[] = []
        // 兼容常见结构：{ from: { componentId, pin }, to: { componentId, pin }, confidence? }
        const from = c?.from
        const to = c?.to
        if (from && from.componentId && from.pin) pins.push(`${from.componentId}.${from.pin}`)
        if (to && to.componentId && to.pin) pins.push(`${to.componentId}.${to.pin}`)
        if (pins.length >= 2) {
          nets.push({ net_id: `N${idx++}`, connected_pins: Array.from(new Set(pins)), signal_type: 'signal', confidence: typeof c.confidence === 'number' ? c.confidence : 1.0 })
        }
      } catch (e) {
        // 跳过无法识别的 connection
      }
    }
  }
  out.nets = nets

  // 透传 overlay（若存在）
  if (raw.overlay) out.overlay = raw.overlay

  // 构造 metadata（最小必填）
  const tEnd = Date.now()
  const source_type = (() => {
    try {
      const anyPdf = images.some((im) => (im.originalname || '').toLowerCase().endsWith('.pdf'))
      return anyPdf ? 'pdf' : 'image'
    } catch { return 'image' }
  })()
  const overall_confidence = computeOverallConfidence(out)
  out.metadata = Object.assign({}, raw.metadata || {}, {
    source_type,
    timestamp: new Date().toISOString(),
    inference_time_ms: Math.max(0, tEnd - tStart),
    overall_confidence,
  })

  // uncertainties（如无来源，保留为空数组）
  if (Array.isArray(raw.uncertainties)) out.uncertainties = raw.uncertainties
  else out.uncertainties = []

  return out
}

// 中文注释：计算整体置信度（nets 与组件 pins 置信度的最小值；若均缺失则默认 1.0）
function computeOverallConfidence(norm: any): number {
  let confidences: number[] = []
  try {
    if (Array.isArray(norm.nets)) {
      for (const n of norm.nets) {
        if (typeof n?.confidence === 'number') confidences.push(n.confidence)
      }
    }
  } catch {}
  try {
    if (Array.isArray(norm.components)) {
      for (const c of norm.components) {
        const pins = Array.isArray(c?.pins) ? c.pins : []
        for (const p of pins) {
          if (typeof p?.confidence === 'number') confidences.push(p.confidence)
        }
      }
    }
  } catch {}
  if (!confidences.length) return 1.0
  return Math.min(...confidences.map((v) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : 1.0)))
}

// 中文注释：判断是否为关键器件（非简单无源器件）
function isKeyComponent(comp: any): boolean {
  try {
    const t = (comp?.type || '').toString().toLowerCase()
    const id = (comp?.id || '').toString().toLowerCase()
    const passive = ['res', 'resistor', 'cap', 'capacitor', 'ind', 'inductor', 'ferrite', 'led', 'diode']
    if (passive.includes(t)) return false
    // 常见关键器件关键词
    const keywords = ['ic', 'mcu', 'pmic', 'soc', 'fpga', 'cpld', 'adc', 'dac', 'amplifier', 'opamp', 'converter', 'regulator', 'transceiver', 'phy', 'controller', 'sensor', 'driver', 'bridge', 'interface']
    if (keywords.some(k => t.includes(k))) return true
    // 若类型未知但编号像 U* 也视为关键器件
    if (/^u\d+/i.test(id)) return true
  } catch {}
  return true
}

// 中文注释：为关键器件检索 datasheet 并落盘，同时保存元数据
async function fetchAndSaveDatasheetsForKeyComponents(components: any[], topN: number): Promise<void> {
  try {
    const datasheetsDir = path.join(__dirname, '..', 'uploads', 'datasheets')
    if (!fs.existsSync(datasheetsDir)) fs.mkdirSync(datasheetsDir, { recursive: true })

    const metaItems: any[] = []
    const nowIso = new Date().toISOString()
    const tsName = nowIso.replace(/[-:]/g, '').replace(/\..+$/, 'Z')

    for (const comp of Array.isArray(components) ? components : []) {
      try {
        if (!isKeyComponent(comp)) continue
        const id = (comp?.id || 'C') as string
        const label = (comp?.label || '') as string
        const value = (comp?.value || '') as string
        const type = (comp?.type || '') as string
        const q = [type, label || id, value, 'datasheet'].filter(Boolean).join(' ')
        const results = await webSearch(q, { topN })
        const first = (results.results || [])[0]
        let savedPath: string | null = null
        let sourceType = 'third-party'
        let docTitle = first?.title || ''
        let docDate = ''
        let confidence = 0.6
        if (first && first.url) {
          try {
            const r = await fetch(first.url, { timeout: 30000 })
            if (r && r.ok) {
              const ct = (r.headers && r.headers.get ? (r.headers.get('content-type') || '') : '')
              const ext = ct.includes('pdf') ? 'pdf' : (ct.includes('html') ? 'html' : 'bin')
              const h = crypto.createHash('sha1').update(first.url).digest('hex').slice(0, 8)
              const safeName = `${String(id || 'C').replace(/[^A-Za-z0-9_-]/g, '')}_${tsName}_${h}.${ext}`
              const filePath = path.join(datasheetsDir, safeName)
              const buf = Buffer.from(await r.arrayBuffer())
              fs.writeFileSync(filePath, buf)
              savedPath = filePath
              // 简单来源类型推断
              const uhost = (() => { try { return new URL(first.url).hostname.toLowerCase() } catch { return '' } })()
              if (/st(\.|-)com|texas|ti\.com|analog\.com|microchip|nxp|infineon|renesas|onsemi|skyworks|nvidia|intel|amd|silabs/.test(uhost)) sourceType = 'manufacturer'
              if (/digikey|mouser|arrow|element14|farnell|rs-online|lcsc/.test(uhost)) sourceType = 'distributor'
              confidence = ct.includes('pdf') ? 0.9 : 0.7
            }
          } catch (e) {
            // 下载失败忽略
          }
        }

        metaItems.push({
          component_name: id,
          query_string: q,
          retrieved_at: nowIso,
          source_url: first?.url || '',
          source_type: sourceType,
          document_title: docTitle,
          document_version_or_date: docDate,
          confidence,
          notes: savedPath ? `saved: ${savedPath}` : 'save skipped or failed',
          candidates: results.results || [],
        })
      } catch (e) {
        logError('vision.datasheets.component.error', { error: String(e) })
      }
    }

    // 聚合元数据写入单文件
    try {
      const metaPath = path.join(datasheetsDir, `metadata_${tsName}.json`)
      fs.writeFileSync(metaPath, JSON.stringify({ items: metaItems }, null, 2), { encoding: 'utf8' })
      logInfo('vision.datasheets.metadata.saved', { path: metaPath, count: metaItems.length })
    } catch (e) {
      logError('vision.datasheets.metadata.save.failed', { error: String(e) })
    }
  } catch (e) {
    logError('vision.datasheets.dir.failed', { error: String(e) })
  }
}


