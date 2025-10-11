import type { SearchProvider } from '../../domain/contracts/index.js'
import { OpenRouterTextProvider } from '../providers/OpenRouterTextProvider.js'
import { logger } from '../log/logger.js'
import { PromptLoader } from '../prompts/PromptLoader.js'

// 中文注释：基于 OpenRouter 的在线检索 provider，使用 openrouter 的 :online 模型
export class OpenRouterSearch implements SearchProvider {
  private provider: OpenRouterTextProvider
  private model: string
  private headers?: Record<string,string>
  private trace?: (evt: any) => Promise<void> | void

  constructor(baseUrl: string, defaultTimeoutMs: number, headers?: Record<string,string>, options?: { modelOverride?: string, forceOnline?: boolean, trace?: (evt: any) => Promise<void> | void }) {
    this.provider = new OpenRouterTextProvider(baseUrl, defaultTimeoutMs)
    const configured = String(options?.modelOverride || process.env.OPENROUTER_SEARCH_MODEL || '').trim()
    const fallback = 'perplexity/sonar'
    const raw = configured || fallback
    const forceOnline = (options?.forceOnline === true) || (String(process.env.OPENROUTER_FORCE_ONLINE || '').trim() === '1')
    // 若是 Perplexity 系列，一般自带联网能力，无需 :online；其它模型在需要时追加 :online 后缀
    const needsOnlineSuffix = forceOnline && !/perplexity\//i.test(raw) && !/:online$/i.test(raw)
    this.model = needsOnlineSuffix ? `${raw}:online` : raw
    this.headers = headers
    this.trace = options?.trace
  }

  // query -> 调用 openrouter 在线模型，要求返回 JSON 数组 [{title,url}] 或以行为单位的条目
  async search(query: string, topN: number): Promise<{ title: string; url: string }[]> {
    try {
      logger.info('web.search.start', { query: query.slice(0, 120), topN })
      // 从外部提示词文件加载 search prompt（pass 类型，variant='search'），加载失败则抛出错误
      const pSearch = PromptLoader.loadPrompt('circuit-agent', 'pass', 'zh', 'search')
      // 支持在 prompt 中使用 {topN} 占位符
      const system = String(pSearch).replace(/\{topN\}/g, String(topN))
      const userMsg = query
      // 显式启用 web 插件进行真实搜索
      const engine = String(process.env.OPENROUTER_WEB_ENGINE || 'exa')
      const plugins = [{ id: 'web', engine, max_results: Math.max(1, Number(topN || 5)) }]
      // 记录原始请求
      try { await this.trace?.({ phase: 'search', target: 'query', direction: 'request', meta: { model: this.model, engine, topN }, body: { system, messages: [{ role: 'user', content: userMsg }], plugins } }) } catch {}
      const resp = await this.provider.chat({ apiUrl: '', model: this.model, system, messages: [{ role: 'user', content: userMsg }], plugins, headers: this.headers })
      const txt = (resp && resp.text) ? resp.text.trim() : ''
      // 记录原始响应
      try { await this.trace?.({ phase: 'search', target: 'query', direction: 'response', meta: { model: this.model }, body: { raw: resp?.raw || '', text: txt } }) } catch {}
      logger.info('web.search.done', { length: txt.length })
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
      const out = results.slice(0, topN)
      logger.info('web.search.parsed', { count: out.length })
      return out
    } catch (e) {
      logger.warn('web.search.error', { message: (e as Error)?.message })
      return []
    }
  }

  // 中文注释：对 URL 进行在线抓取并在上游汇总为指定语言与词数上限的纯文本摘要
  async summarizeUrl(url: string, wordLimit: number, lang: 'zh'|'en'): Promise<string> {
    try {
      logger.info('web.summary.start', { url, wordLimit, lang })
      const limit = Math.max(64, Math.min(2048, Number(wordLimit || 1024)))
      // 从外部提示词文件加载 summary prompt（pass 类型，variant='summary'），加载失败则抛出错误
      const pSummary = PromptLoader.loadPrompt('circuit-agent', 'pass', 'zh', 'summary')
      const system = String(pSummary).replace(/\{limit\}/g, String(limit)).replace(/\{lang\}/g, lang === 'zh' ? 'Chinese' : 'English')
      const userMsg = `URL: ${url}`
      // 显式启用 web 插件；engine 可通过环境变量覆盖（native/exa）
      const engine = String(process.env.OPENROUTER_WEB_ENGINE || 'exa')
      const maxResults = Number(process.env.OPENROUTER_WEB_MAX_RESULTS || 1)
      const plugins = [{ id: 'web', engine, max_results: maxResults, search_prompt: 'Some relevant web results:' }]
      // 记录原始请求
      // 固定上游模型为 qwen 系列，用于摘要轮
      const modelName = 'qwen/qwen2.5-vl-72b-instruct:free'
      try { await this.trace?.({ phase: 'search', target: 'summary', direction: 'request', meta: { model: modelName, engine, url, wordLimit: limit, lang }, body: { system, messages: [{ role: 'user', content: userMsg }], plugins } }) } catch {}
      const resp = await this.provider.chat({ apiUrl: '', model: modelName, system, messages: [{ role: 'user', content: userMsg }], plugins, headers: this.headers })
      const txt = (resp && resp.text) ? resp.text.trim() : ''
      // 记录原始响应
      try { await this.trace?.({ phase: 'search', target: 'summary', direction: 'response', meta: { model: modelName, url }, body: { raw: resp?.raw || '', text: txt } }) } catch {}
      logger.info('web.summary.done', { length: txt.length })
      return txt
    } catch (e) {
      logger.warn('web.summary.error', { url, message: (e as Error)?.message })
      return ''
    }
  }
}


