import type { ReviewRequest, ReviewReport, VisionChatProvider, ArtifactStore, RichMessage, SearchProvider } from '../../domain/contracts/index.js'
import { logger } from '../../infra/log/logger.js'
import { AnonymizationService } from '../services/AnonymizationService.js'
import { TimelineService } from '../services/TimelineService.js'

// 中文注释：直接评审模式——将图片/PDF 等附件与系统提示词/需求/规范直接发给视觉模型，产出 Markdown 报告
export class DirectReviewUseCase {
  constructor(
    private vision: VisionChatProvider,
    private artifact: ArtifactStore,
    private timeline: TimelineService,
    // 可选：注入搜索提供者以便在开启 enableSearch 时用于联网检索
    private searchProvider?: SearchProvider,
  ) {}

  async execute(params: {
    apiUrl: string
    model: string
    request: ReviewRequest
    authHeader?: string
  }): Promise<ReviewReport> {
    const { apiUrl, model } = params
    const progressId = params.request.options?.progressId
    const anonymizer = new AnonymizationService()

    // 1) 准备富消息：system + user(parts: text + images as data URLs)
    const sys = params.request.systemPrompt || ''
    const texts: string[] = []
    if (params.request.requirements) texts.push(`Design requirements:\n${params.request.requirements}`)
    if (params.request.specs) texts.push(`Design specs:\n${params.request.specs}`)
    if (params.request.dialog) texts.push(`User dialog:\n${params.request.dialog}`)

    const parts: RichMessage[] = []
    if (sys) parts.push({ role: 'system', content: sys })
    // 注入额外的 system 消息（如资料摘要），放在主 systemPrompt 之后、用户消息之前
    try {
      const extraSystems = (params.request as any).extraSystems as string[] | undefined
      if (Array.isArray(extraSystems) && extraSystems.length > 0) {
        for (const s of extraSystems) {
          try { if (typeof s === 'string' && s.trim().length > 0) parts.push({ role: 'system', content: s }) } catch {}
        }
      }
    } catch {}

    const userParts: any[] = []
    if (texts.length > 0) userParts.push({ type: 'text', text: texts.join('\n\n') })

    // 附件：转换为 data URL（注意可能很大；此处为 MVP 实现）
    const files = params.request.files || []
    for (const f of files) {
      try {
        const b64 = Buffer.from(f.bytes).toString('base64')
        const url = `data:${f.mime || 'application/octet-stream'};base64,${b64}`
        userParts.push({ type: 'image_url', image_url: { url } })
      } catch {}
    }
    parts.push({ role: 'user', content: userParts })

    // 1.5) 如果存在历史会话，将历史按轮次追加为 assistant/user 消息，便于 LLM 理解上下文
    try {
      const history = (params.request as any).history || []
      if (Array.isArray(history) && history.length > 0) {
        for (const h of history) {
          try {
            const hh = h as any
            const role = typeof hh?.role === 'string' ? hh.role : undefined
            const content = typeof hh?.content === 'string' ? hh.content : undefined
            if (role && content) {
              const r = role === 'assistant' ? 'assistant' : 'user'
              parts.push({ role: r, content })
              continue
            }
            // 兼容历史字段
            if (hh.modelMarkdown) parts.push({ role: 'assistant', content: String(hh.modelMarkdown) })
            if (hh.dialog) parts.push({ role: 'user', content: String(hh.dialog) })
          } catch {}
        }
      }
    } catch {}

    // 如果启用了搜索，并注入了搜索提供者，则执行检索并将摘要作为 system 消息加入上下文
    try {
      const enableSearch = ((params.request as any).enableSearch === true) || (params.request.options && (params.request.options as any).enableSearch === true)
      if (enableSearch && this.searchProvider) {
        const qParts: string[] = []
        if (params.request.requirements) qParts.push(params.request.requirements)
        if (params.request.specs) qParts.push(params.request.specs)
        if (params.request.dialog) qParts.push(params.request.dialog)
        const q = qParts.join('\n') || ''
        if (q) {
          try {
            const topN = Number((params.request as any).searchTopN || ((params.request.options as any) && (params.request.options as any).searchTopN) || 5)
            logger.info('direct.search.start', { progressId, query: q.slice(0, 120), topN })
            const hits = await this.searchProvider.search(q, topN)
            logger.info('direct.search.hits', { count: Array.isArray(hits) ? hits.length : 0 })
            if (Array.isArray(hits) && hits.length > 0) {
              const summary = hits.map((s: any, i: number) => `${i + 1}. ${s.title} — ${s.url}`).join('\n')
              parts.unshift({ role: 'system', content: `Search results summary:\n${summary}` })
              try { await this.timeline.push(progressId, this.timeline.make('search.results', { count: hits.length, query: q }, { origin: 'backend', category: 'search' })) } catch {}
            }
            // 对每个命中尝试抓取并保存摘要，记录到 timeline
            try {
              let idx = 0
              for (const h of (Array.isArray(hits) ? hits : [])) {
                if (idx++ >= topN) break
                try {
                  logger.info('direct.search.summarize', { url: h.url })
                  const s = await this.searchProvider.summarizeUrl(h.url, 1024, (params.request as any).language || 'zh')
                  const lower = String(s || '').toLowerCase()
                  const failed = (!s || s.trim().length < 50 || ['无法直接访问', 'unable to access', 'not accessible', 'forbidden', 'blocked', 'captcha', 'login required', '需要登录', 'could not fetch', 'timed out'].some(m => lower.includes(m)))
                  if (failed) {
                    try { await this.timeline.push(progressId, this.timeline.make('search.summary.failed', { title: h.title, url: h.url, textSnippet: String(s||'').slice(0,200) }, { origin: 'backend', category: 'search' })) } catch {}
                    continue
                  }
                  if (s && s.trim()) {
                    try {
                      const saved = await this.artifact.save(s, 'search_summary', { ext: '.txt', contentType: 'text/plain' })
                      try { await this.timeline.push(progressId, this.timeline.make('search.summary.saved', { title: h.title, url: h.url, artifact: saved, summarySnippet: String(s).slice(0, 1000) }, { origin: 'backend', category: 'search' })) } catch {}
                      parts.unshift({ role: 'system', content: `External source summary (${h.title} - ${h.url}):\n${s}` })
                    } catch (e) {
                      logger.warn('direct.search.save_failed', { url: h.url, error: (e as any)?.message || String(e) })
                    }
                  }
                } catch (e) {
                  logger.warn('direct.search.summarize_failed', { url: h.url, error: (e as any)?.message || String(e) })
                }
              }
            } catch (e) { logger.warn('direct.search.summary_loop_failed', { error: (e as any)?.message || String(e) }) }
          } catch {}
        }
      }
    } catch {}

    // 2) 时间线：请求入队
    // 中文注释：补充请求 meta 信息（不脱敏），包含消息条数、历史与附件标记
    const messageCount = (() => {
      try {
        const all: any[] = []
        for (const m of parts) all.push(m)
        return all.length
      } catch { return (parts as any[]).length || 0 }
    })()
    const hasHistory = (() => { try { return Array.isArray((params.request as any).history) && (params.request as any).history.length > 0 } catch { return false } })()
    const hasAttachments = (files && files.length > 0)

    // 中文注释：在调用上游前，生成与上游一致的请求体并保存为 artifact（完整 JSON）
    const requestBody = { model, messages: parts, stream: false }
    const reqArtifact = await this.artifact.save(JSON.stringify(requestBody, null, 2), 'llm_request', { ext: '.json', contentType: 'application/json' })

    const tlReq = this.timeline.make('llm.request', {
      apiUrl,
      model,
      messageCount,
      hasHistory,
      hasAttachments
    }, { origin: 'backend', category: 'llm' })
    // 将请求 artifact 挂载到时间线条目
    ;(tlReq as any).artifacts = Object.assign({}, (tlReq as any).artifacts || {}, { request: reqArtifact })
    await this.timeline.push(progressId, tlReq)

    // 3) 调用上游
    const headers: Record<string,string> = {}
    if (params.authHeader) headers['Authorization'] = params.authHeader
    // 中文注释：按需求不做脱敏，直接使用原始 parts 调用上游
    const resp = await this.vision.chatRich({ apiUrl, model, messages: parts, headers, timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 7200000) })

    // 4) 报告与工件
    // 保存上游原始 JSON 响应为 artifact（完整）
    const respRaw = String(resp.raw || '')
    const respArtifact = await this.artifact.save(respRaw, 'llm_response', { ext: '.json', contentType: 'application/json' })

    const reportA = await this.artifact.save(resp.text || '', 'direct_review_report', { ext: '.md', contentType: 'text/markdown' })
    const tlResp = this.timeline.make('llm.response', {
      snippet: String(resp.text || '').slice(0, 1000),
      contentLength: respRaw.length
    }, { origin: 'backend', category: 'llm' })
    ;(tlResp as any).artifacts = Object.assign({}, (tlResp as any).artifacts || {}, { response: respArtifact, result: reportA })
    await this.timeline.push(progressId, tlResp)

    return { markdown: resp.text, timeline: [tlReq, tlResp] }
  }
}


