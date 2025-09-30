import type { ReviewRequest, ReviewReport, VisionChatProvider, ArtifactStore, RichMessage, SearchProvider } from '../../domain/contracts/index.js'
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
            if (hh.modelMarkdown) {
              parts.push({ role: 'assistant', content: String(hh.modelMarkdown) })
            }
            if (hh.dialog) {
              parts.push({ role: 'user', content: String(hh.dialog) })
            }
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
            const hits = await this.searchProvider.search(q, topN)
            if (Array.isArray(hits) && hits.length > 0) {
              const summary = hits.map((s: any, i: number) => `${i + 1}. ${s.title} — ${s.url}`).join('\n')
              parts.unshift({ role: 'system', content: `Search results summary:\n${summary}` })
            }
          } catch {}
        }
      }
    } catch {}

    // 2) 时间线：请求入队
    const tlReq = this.timeline.make('llm.request', { model, apiUrl })
    await this.timeline.push(progressId, tlReq)

    // 3) 调用上游
    const headers: Record<string,string> = {}
    if (params.authHeader) headers['Authorization'] = params.authHeader
    // 匿名化（仅文本类）
    const scrubbedParts = anonymizer.scrubInput(parts)
    const resp = await this.vision.chatRich({ apiUrl, model, messages: scrubbedParts, headers, timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 7200000) })

    // 4) 报告与工件
    const reportA = await this.artifact.save(resp.text || '', 'direct_review_report', { ext: '.md', contentType: 'text/markdown' })
    const tlResp = this.timeline.make('llm.response', { snippet: String(resp.text || '').slice(0, 1000), artifacts: { result: reportA } })
    await this.timeline.push(progressId, tlResp)

    return { markdown: resp.text, timeline: [tlReq, tlResp] }
  }
}


