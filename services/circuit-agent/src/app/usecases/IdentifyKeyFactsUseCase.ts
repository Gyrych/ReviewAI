/*
功能：关键事实识别用例（IdentifyKeyFactsUseCase）
用途：从输入资料中抽取关键元器件与技术路线，产出结构化 JSON 清单。
参数：
- constructor(vision, artifact, timeline)
- execute({ apiUrl, model, request, authHeader? })
返回：
- Promise<{ keyComponents: string[]; keyTechRoutes: string[]; timeline: any[] }>
示例：
// const uc = new IdentifyKeyFactsUseCase(vision, store, timeline)
// const r = await uc.execute({ apiUrl, model, request })
*/
import type { ReviewRequest, VisionChatProvider, ArtifactStore, RichMessage } from '../../domain/contracts/index.js'
import { TimelineService } from '../services/TimelineService.js'
import { PromptLoader } from '../../infra/prompts/PromptLoader.js'
import { logger } from '../../infra/log/logger.js'

// 中文注释：识别轮——从资料中抽取关键元器件与关键技术路线，产出 JSON 清单
export class IdentifyKeyFactsUseCase {
  constructor(
    private vision: VisionChatProvider,
    private artifact: ArtifactStore,
    private timeline: TimelineService,
  ) {}

  async execute(params: {
    apiUrl: string
    model: string
    request: ReviewRequest & { language: 'zh'|'en' }
    authHeader?: string
  }): Promise<{ keyComponents: string[]; keyTechRoutes: string[]; timeline: any[] }> {
    const { apiUrl, model } = params
    const progressId = params.request.options?.progressId

    // 准备提示词（识别轮）
    let systemPrompt = ''
    try {
      // pass 类型不区分语言文件名，这里优先尝试存在的 identify_prompt.md
      systemPrompt = PromptLoader.loadPrompt('circuit-agent', 'pass', 'zh', 'identify')
    } catch {
      // 回退：内置简化提示词（按语言）
      systemPrompt = params.request.language === 'zh'
        ? '请你根据用户提供的需求、规范、对话和图片，识别并返回 JSON：{"keyComponents":[],"keyTechRoutes":[] }。只返回 JSON。'
        : 'Identify key components and key technical routes. Return pure JSON: {"keyComponents":[],"keyTechRoutes":[]} only.'
    }

    const parts: RichMessage[] = []
    if (systemPrompt) parts.push({ role: 'system', content: systemPrompt })

    const texts: string[] = []
    if (params.request.requirements) texts.push(`Requirements:\n${params.request.requirements}`)
    if (params.request.specs) texts.push(`Specs:\n${params.request.specs}`)
    if (params.request.dialog) texts.push(`Dialog:\n${params.request.dialog}`)
    const userParts: any[] = []
    if (texts.length > 0) userParts.push({ type: 'text', text: texts.join('\n\n') })
    const files = params.request.files || []
    for (const f of files) {
      try {
        const b64 = Buffer.from(f.bytes).toString('base64')
        const url = `data:${f.mime || 'application/octet-stream'};base64,${b64}`
        userParts.push({ type: 'image_url', image_url: { url } })
      } catch {}
    }
    parts.push({ role: 'user', content: userParts })

    // timeline：请求
    const reqBody = { model, messages: parts, stream: false }
    const reqArtifact = await this.artifact.save(JSON.stringify(reqBody, null, 2), 'identify_request', { ext: '.json', contentType: 'application/json' })
    logger.info('identify.request.saved', { artifact: reqArtifact })
    const tlReq = this.timeline.make('identify.request', {}, { origin: 'backend', category: 'llm' })
    ;(tlReq as any).artifacts = { request: reqArtifact }
    await this.timeline.push(progressId, tlReq)

    // 调用上游
    const headers: Record<string,string> = {}
    if (params.authHeader) headers['Authorization'] = params.authHeader
    logger.info('identify.upstream.call', { apiUrl, model, messageCount: parts.length })
    const resp = await this.vision.chatRich({ apiUrl, model, messages: parts, headers, timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 7200000) })

    // 保存响应
    const raw = String(resp.raw || '')
    const respArtifact = await this.artifact.save(raw, 'identify_response', { ext: '.json', contentType: 'application/json' })
    logger.info('identify.response.saved', { artifact: respArtifact, textSnippet: (resp.text || '').slice(0, 200) })
    const tlResp = this.timeline.make('identify.response', { snippet: String(resp.text || '').slice(0, 500) }, { origin: 'backend', category: 'llm' })
    ;(tlResp as any).artifacts = { response: respArtifact }
    await this.timeline.push(progressId, tlResp)

    // 解析 JSON
    let keyComponents: string[] = []
    let keyTechRoutes: string[] = []
    try {
      const text = (resp.text || '').trim()
      const m = text.match(/\{[\s\S]*\}$/)
      const j = m ? JSON.parse(m[0]) : JSON.parse(text)
      if (Array.isArray(j?.keyComponents)) keyComponents = j.keyComponents.map((x: any) => String(x)).filter(Boolean)
      if (Array.isArray(j?.keyTechRoutes)) keyTechRoutes = j.keyTechRoutes.map((x: any) => String(x)).filter(Boolean)
    } catch (e) {
      // 记录解析失败的详细信息，便于排查非 JSON 或格式不符合的问题
      try { logger.warn('identify.parse.failed', { error: (e as Error)?.message || String(e), snippet: String(resp.text || '').slice(0, 1000) }) } catch {}
      // 同时保存完整响应与上下文到 artifact 以便离线分析
      try {
        const ctx = {
          ts: Date.now(),
          error: (e as Error)?.message || String(e),
          respText: String(resp.text || ''),
          requestSnippet: String(JSON.stringify(parts || []).slice(0, 2000))
        }
        try {
          const fn: any = await this.artifact.save(JSON.stringify(ctx, null, 2), 'identify_parse_failure', { ext: '.json', contentType: 'application/json' })
          try { await this.timeline.push(progressId, this.timeline.make('identify.parse.failure.saved', { artifact: fn }, { origin: 'backend', category: 'search' })) } catch {}
        } catch (se) { try { logger.warn('identify.parse.failure.save_failed', { error: (se as any)?.message || String(se) }) } catch {} }
      } catch {}
    }

    return { keyComponents, keyTechRoutes, timeline: [tlReq, tlResp] }
  }
}


