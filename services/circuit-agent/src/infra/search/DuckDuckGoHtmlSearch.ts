import type { SearchProvider } from '../../domain/contracts/index.js'

// 中文注释：DuckDuckGo HTML 抓取（不依赖 API Key），解析锚点；若失败可回退 r.jina.ai 代理
export class DuckDuckGoHtmlSearch implements SearchProvider {
  async search(query: string, topN: number): Promise<{ title: string; url: string }[]> {
    const fetch = (await import('node-fetch')).default as any
    const results: { title: string; url: string }[] = []

    async function tryFetch(url: string): Promise<string|null> {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 })
        if (r && r.ok) return await r.text()
      } catch {}
      return null
    }

    const primary = await tryFetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`)
    let html = primary
    if (!html) html = await tryFetch(`https://r.jina.ai/http://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`)

    if (html) {
      const rx = /<a[^>]*href=\"([^\"]*)\"[^>]*>([^<]*)<\/a>/g
      let m: RegExpExecArray | null
      const seen = new Set<string>()
      while ((m = rx.exec(html)) !== null && results.length < (topN || 5)) {
        const url = m[1]
        const title = (m[2] || '').replace(/<\/?b>/g, '').trim()
        if (!url || !title) continue
        if (!/^https?:\/\//i.test(url)) continue
        if (/duckduckgo\.com/i.test(url)) continue
        if (seen.has(url)) continue
        seen.add(url)
        results.push({ title, url })
      }
    }

    return results.slice(0, topN || 5)
  }
}


