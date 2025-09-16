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

  // 对于每张图片，向 apiUrl 发送 multipart/form-data 请求，要求返回 JSON
  const combined: any = { components: [], connections: [] }

  for (const img of images) {
    const form = new (require('form-data'))()
    form.append('file', fs.createReadStream(img.path), { filename: img.originalname })
    // 在 prompt 中指示模型返回严格的 JSON，遵循约定 schema
    form.append('prompt', `Please analyze the circuit diagram image and return a JSON with keys: components (array), connections (array). Each component should have id,type,label,params,pins. connections should list from/to with componentId and pin. Return only JSON.`)
    form.append('model', model)

    const headers: any = Object.assign({}, form.getHeaders())
    if (authHeader) headers['Authorization'] = authHeader

    const resp = await fetch(apiUrl, { method: 'POST', body: form, headers, timeout: 30000 })
    if (!resp.ok) {
      const txt = await resp.text()
      throw new Error(`vision upstream error: ${resp.status} ${txt.substring(0, 200)}`)
    }
    const txt = await resp.text()
    let j: any = null
    try {
      j = JSON.parse(txt)
    } catch (e) {
      // 如果返回不是纯 JSON，尝试抽取首个 JSON 对象
      const m = txt.match(/\{[\s\S]*\}/)
      if (m) {
        try { j = JSON.parse(m[0]) } catch (e2) { throw new Error('vision: failed to parse JSON response') }
      } else {
        throw new Error('vision: no JSON in response')
      }
    }

    // 合并 components 与 connections（简单拼接，未做去重）
    if (Array.isArray(j.components)) combined.components.push(...j.components)
    if (Array.isArray(j.connections)) combined.connections.push(...j.connections)
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

