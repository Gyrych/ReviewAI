import fetch from 'node-fetch'
import { URL } from 'url'

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

        if (resp.ok) {
          const html = await resp.text()
          // 简单解析DuckDuckGo HTML结果
          const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g
          const snippetRegex = /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>.*?<span[^>]*>([^<]*)</g
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
        }
      } catch (e) {
        // 如果HTML搜索失败，回退到API
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


