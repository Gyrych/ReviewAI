import fetch from 'node-fetch'
import { URL } from 'url'
import { logInfo, logError } from './logger'

type SearchResult = {
  query: string
  provider: string
  results: Array<{ title: string; url: string; snippet: string }>
  fetchedAt: string
}

// Simple in-memory cache to avoid repeated identical queries
const cache: Map<string, { ts: number; data: SearchResult }> = new Map()
const DEFAULT_TTL_MS = 1000 * 60 * 60 // 1 hour

function cacheKey(q: string, provider?: string, topN?: number) {
  return `${provider || 'duckduckgo'}::${topN || 5}::${q}`
}

export async function webSearch(query: string, opts?: { provider?: string; topN?: number; apiKey?: string }): Promise<SearchResult> {
  const provider = (opts && opts.provider) || process.env.SEARCH_PROVIDER || 'duckduckgo'
  const topN = (opts && opts.topN) || Number(process.env.SEARCH_TOPN) || 5
  const key = cacheKey(query, provider, topN)
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && (now - cached.ts) < DEFAULT_TTL_MS) return cached.data

  let results: Array<{ title: string; url: string; snippet: string }> = []
  let providerUsed = provider

  try {
    // 优先尝试Bing搜索（如果有API key）
    if (provider === 'bing' || (opts && opts.apiKey || process.env.BING_API_KEY)) {
      const keyVal = (opts && opts.apiKey) || process.env.BING_API_KEY || ''
      if (keyVal) {
        providerUsed = 'bing'
        const url = new URL('https://api.bing.microsoft.com/v7.0/search')
        url.searchParams.set('q', query)
        url.searchParams.set('count', String(topN))
        const resp = await fetch(url.toString(), { headers: { 'Ocp-Apim-Subscription-Key': keyVal }, timeout: 10000 })
        if (resp.ok) {
          const j = await resp.json()
          if (j.webPages && Array.isArray(j.webPages.value)) {
            results = j.webPages.value.slice(0, topN).map((v: any) => ({ title: v.name || '', url: v.url || '', snippet: v.snippet || v.snippet || '' }))
          }
        }
      }
    }

    // 如果Bing没有结果或没有API key，使用DuckDuckGo
    if (results.length === 0) {
      // 首先尝试DuckDuckGo的HTML搜索（更好的搜索结果）
      try {
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
        const resp = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          timeout: 15000
        })

        if (resp && resp.ok) {
          const html = await resp.text()
          // 简单解析DuckDuckGo HTML结果
          const linkRegex = /<a[^>]*href=\"([^\"]*)\"[^>]*>([^<]*)<\/a>/g
          let match

          while ((match = linkRegex.exec(html)) !== null && results.length < topN) {
            const url = match[1]
            const title = match[2].replace(/<\/?b>/g, '').trim()

            if (url && title && url.startsWith('http') && !url.includes('duckduckgo.com')) {
              results.push({
                title: title,
                url: url,
                snippet: `Search result for: ${query}`
              })
            }
          }

          // 如果解析后仍然没有结果，记录 HTML 摘要用于诊断（前 2KB）
          if (results.length === 0) {
            try {
              const snippet = String(html).slice(0, 2048)
              logInfo('search.html.snippet', { provider: 'duckduckgo_html', query, snippet })
            } catch (e) {
              // 忽略日志写入错误
            }
          }
        } else if (resp) {
          // 非 2xx 响应，记录少量响应体用于调试
          let snippet = ''
          try { snippet = (await resp.text()).slice(0, 1024) } catch { snippet = 'could not read body' }
          logError('search.html.fetch_failed', { provider: 'duckduckgo_html', url: searchUrl, http_status: resp.status, snippet })
        }

        // 如果直接抓取结果为空或失败，尝试通过公共代理 r.jina.ai 回退抓取（可能绕过简单反爬）
        if (results.length === 0) {
          try {
            const proxyUrl = `https://r.jina.ai/http://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
            const pResp = await fetch(proxyUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 })
            if (pResp && pResp.ok) {
              const pHtml = await pResp.text()
              // 解析代理返回的 HTML
              let pMatch
              while ((pMatch = /<a[^>]*href=\"([^\"]*)\"[^>]*>([^<]*)<\/a>/g.exec(pHtml)) !== null && results.length < topN) {
                const url = pMatch[1]
                const title = pMatch[2].replace(/<\/?b>/g, '').trim()
                if (url && title && url.startsWith('http') && !url.includes('duckduckgo.com')) {
                  results.push({ title: title, url: url, snippet: `Search result for: ${query}` })
                }
              }
              // 如果锚点解析仍为空，尝试从纯文本中提取 URL（代理可能返回纯文本）
              if (results.length === 0) {
                try {
                  const urlRegex = /https?:\/\/[^\s"'<>]+/g
                  const seen = new Set<string>()
                  const preferred = [
                    'ti.com','texas','analog.com','st.com','stmicroelectronics','microchip.com','nxp.com','infineon.com','renesas.com','onsemi.com','skyworksinc.com','nvidia.com','intel.com','amd.com','silabs.com',
                    'mouser.com','digikey','arrow.com','farnell','element14','rs-online','lcsc.com'
                  ]
                  const candidates: Array<{ url: string; score: number }> = []
                  let m: RegExpExecArray | null
                  while ((m = urlRegex.exec(pHtml)) !== null) {
                    const u = m[0]
                    if (!u.startsWith('http')) continue
                    try {
                      const host = new URL(u).hostname.toLowerCase()
                      if (host.includes('duckduckgo.com')) continue
                      if (seen.has(u)) continue
                      seen.add(u)
                      let score = 0
                      if (u.toLowerCase().endsWith('.pdf')) score += 5
                      if (preferred.some(p => host.includes(p))) score += 3
                      candidates.push({ url: u, score })
                    } catch {}
                  }
                  candidates.sort((a,b) => b.score - a.score)
                  for (const c of candidates.slice(0, topN - results.length)) {
                    results.push({ title: c.url.split('/').slice(2,3)[0] || 'link', url: c.url, snippet: `Search result for: ${query}` })
                  }
                } catch {}
              }
              if (results.length === 0) {
                const snippet = String(pHtml).slice(0, 2048)
                logInfo('search.html.proxy_snippet', { provider: 'jina_proxy', query, snippet })
              } else {
                logInfo('search.html.proxy_success', { provider: 'jina_proxy', query, count: results.length })
              }
            } else if (pResp) {
              let snippet = ''
              try { snippet = (await pResp.text()).slice(0, 1024) } catch { snippet = 'could not read body' }
              logError('search.proxy.fetch_failed', { provider: 'jina_proxy', url: proxyUrl, http_status: pResp.status, snippet })
            }
          } catch (e: any) {
            const errMsg = e && e.message ? e.message : String(e)
            logError('search.proxy.exception', { provider: 'jina_proxy', query, error: errMsg })
          }
        }
      } catch (e: any) {
        // 记录异常以便诊断 HTML 抓取失败的原因
        const errMsg = e && e.message ? e.message : String(e)
        const stack = e && e.stack ? e.stack : undefined
        logError('search.html.exception', { provider: 'duckduckgo_html', query, error: errMsg, stack })
      }

      // 如果HTML搜索也没有结果，使用Instant Answer API
      if (results.length === 0) {
        const url = new URL('https://api.duckduckgo.com/')
        url.searchParams.set('q', query)
        url.searchParams.set('format', 'json')
        url.searchParams.set('no_html', '1')
        url.searchParams.set('skip_disambig', '1')
        const resp = await fetch(url.toString(), { timeout: 10000 })
        if (resp.ok) {
          const j = await resp.json()
          // Try AbstractText and RelatedTopics
          if (j.AbstractText && j.AbstractURL) {
            results.push({ title: j.Heading || j.AbstractText.slice(0, 80), url: j.AbstractURL || '', snippet: j.AbstractText })
          }
          if (Array.isArray(j.RelatedTopics)) {
            for (const t of j.RelatedTopics) {
              if (t.Text && t.FirstURL) {
                results.push({ title: t.Text.split(' - ')[0], url: t.FirstURL, snippet: t.Text })
              } else if (t.Topics && Array.isArray(t.Topics)) {
                for (const tt of t.Topics) {
                  if (tt.Text && tt.FirstURL) results.push({ title: tt.Text.split(' - ')[0], url: tt.FirstURL, snippet: tt.Text })
                }
              }
              if (results.length >= topN) break
            }
          }
        }
      }

      providerUsed = 'duckduckgo'
    }
  } catch (e) {
    // swallow errors and return what we have
  }

  // Deduplicate and trim to topN
  const seen = new Set<string>()
  results = results.filter(r => {
    if (!r || !r.url) return false
    if (seen.has(r.url)) return false
    seen.add(r.url)
    return true
  }).slice(0, topN)

  const out: SearchResult = { query, provider: providerUsed, results, fetchedAt: new Date().toISOString() }
  try { cache.set(key, { ts: now, data: out }) } catch (e) {}
  return out
}

export default { webSearch }


