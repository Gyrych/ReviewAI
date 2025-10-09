import type { SearchProvider } from '../../domain/contracts/index.js'
import { OpenRouterTextProvider } from '../providers/OpenRouterTextProvider.js'

// 中文注释：基于 OpenRouter 的在线检索 provider，使用 openrouter 的 :online 模型
export class OpenRouterSearch implements SearchProvider {
  private provider: OpenRouterTextProvider
  private model: string

  constructor(baseUrl: string, defaultTimeoutMs: number) {
    this.provider = new OpenRouterTextProvider(baseUrl, defaultTimeoutMs)
    this.model = String(process.env.OPENROUTER_SEARCH_MODEL || 'openai/gpt-4o:online')
  }

  // query -> 调用 openrouter 在线模型，要求返回 JSON 数组 [{title,url}] 或以行为单位的条目
  async search(query: string, topN: number): Promise<{ title: string; url: string }[]> {
    try {
      const system = `You are a web search tool. Given the user query, return a JSON array of up to ${topN} items, each an object with keys \"title\" and \"url\". Return only the JSON array and no extra text.`
      const userMsg = query
      const resp = await this.provider.chat({ apiUrl: '', model: this.model, system, messages: [{ role: 'user', content: userMsg }] })
      const txt = (resp && resp.text) ? resp.text.trim() : ''
      if (!txt) return []
      // 尝试解析为 JSON
      try {
        const j = JSON.parse(txt)
        if (Array.isArray(j)) {
          const out = j.slice(0, topN).map((it: any) => ({ title: String(it.title || it.name || '').trim(), url: String(it.url || it.link || '').trim() })).filter((x: any) => x.title && x.url)
          return out
        }
      } catch {}

      // 回退：尝试按行抽取 url/title（简单的 'title - url' 或 'url title' 格式）
      const lines = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      const results: { title: string; url: string }[] = []
      for (const l of lines) {
        if (results.length >= topN) break
        // 尝试 url 在行内
        const urlMatch = l.match(/(https?:\/\/[^\s,;]+)/i)
        if (urlMatch) {
          const url = urlMatch[1]
          const title = l.replace(url, '').replace(/[\-–—:]+/g, ' ').trim() || url
          results.push({ title, url })
        }
      }
      return results.slice(0, topN)
    } catch (e) {
      return []
    }
  }
}


