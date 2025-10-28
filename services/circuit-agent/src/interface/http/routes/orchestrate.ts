/*
功能：/orchestrate/review 编排路由
用途：根据参数在 direct 与 fine 流程间进行编排，调用相应 usecase 并产出结果。
参数：
- Express 依赖注入：ArtifactStore、UseCases、SearchProvider 等
返回：
- 统一 JSON 响应，包含 timeline/artifacts 等字段
示例：
// app.post('/orchestrate/review', handler)
*/
import type { Request, Response } from 'express'
// multer types may be unavailable in some environments; import as any to avoid TS type error
// multer types may be unavailable in some environments; import as any to avoid TS type error
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import type { Attachment, CircuitGraph, ArtifactStore } from '../../../domain/contracts/index.js'
import { DirectReviewUseCase } from '../../../app/usecases/DirectReviewUseCase.js'
import { PromptLoader } from '../../../infra/prompts/PromptLoader.js'
import { IdentifyKeyFactsUseCase } from '../../../app/usecases/IdentifyKeyFactsUseCase.js'
import { OpenRouterSearch } from '../../../infra/search/OpenRouterSearch.js'
import retry from '../../../utils/retry.js'
import type { SearchProvider } from '../../../domain/contracts/index.js'
import { logger } from '../../../infra/log/logger.js'
import { ArtifactStoreFs } from '../../../infra/storage/ArtifactStoreFs.js'
import { loadConfig } from '../../../config/config.js'

// 中文注释：统一编排入口，根据 directReview=false/true 选择流程
export function makeOrchestrateRouter(deps: {
  storageRoot: string
  artifact: ArtifactStore
  direct: DirectReviewUseCase
  structured?: any
  multi?: any
  aggregate?: any
  identify?: IdentifyKeyFactsUseCase
  search?: SearchProvider
  // 新增：注入 timeline 服务以便在生成 search timeline 时直接写入进度存储
  timeline?: any
}) {
  const uploadDir = path.join(deps.storageRoot, 'tmp')
  try { if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true }) } catch {}
  const upload = multer({ dest: uploadDir })

  const handler = async (req: Request, res: Response) => {
    try {
      const body = req.body || {}
      const apiUrl = String(body.apiUrl || '')
      const model = String(body.model || '')
      if (!apiUrl || !model) return res.status(400).json({ error: 'apiUrl and model are required' })
      const authHeader = req.header('authorization') || undefined
      const directReview = String(body.directReview || 'false').toLowerCase() === 'true'
      // 入口保护：structured 模式已退役，强制使用 directReview=true
      if (!directReview) {
        return res.status(410).json({ error: 'structured mode removed; use directReview=true' })
      }
      const progressId = String(body.progressId || '') || undefined

      const filesField = (req as any).files as any[] || []
      const attachments: Attachment[] = filesField.map((f) => ({ name: f.originalname || f.filename, mime: f.mimetype || 'application/octet-stream', bytes: fs.readFileSync(f.path) }))

      if (directReview) {
        const parsedHistory = (() => { try { return body.history ? (typeof body.history === 'string' ? JSON.parse(body.history) : body.history) : [] } catch { return [] } })()
        const enableSearchFlag = String(body.enableSearch || 'false').toLowerCase() === 'true'
        const searchTopN = Number(body.searchTopN || 5)

        // 中文注释：读取 language 参数（默认 'zh'），验证合法性
        const language = String(body.language || 'zh')
        if (!['zh', 'en'].includes(language)) {
          return res.status(400).json({ error: 'Invalid language parameter. Must be "zh" or "en".' })
        }

        // 中文注释：根据报告片段与非空消息判断是否为修订轮，并记录摘要日志
        function isRevisionByHistory(h: any[]): boolean {
          // 更严格的修订判定：仅当历史包含 assistant 消息或显式报告标记时
          if (!Array.isArray(h)) return false
          const toString = (v: any) => { try { return typeof v === 'string' ? v : (v?.toString?.() ?? '') } catch { return '' } }
          const lower = (s: string) => toString(s).toLowerCase()
          const reportMarkers = ['## 元信息','## 本轮修订摘要','## 评审报告','【评审报告】','## metadata','## revision summary','## review report'].map(m => m.toLowerCase())

          let hasAssistantMessage = false
          for (const item of h) {
            try {
              const role = (item as any)?.role
              const content = toString((item as any)?.content)
              if (role === 'assistant' && content.trim().length > 0) {
                hasAssistantMessage = true
              }
              const lc = lower(content)
              if (reportMarkers.some(m => lc.includes(m))) {
                logger.info('history.revision.marker', {})
                return true
              }
            } catch (e) {}
          }

          if (hasAssistantMessage) {
            logger.info('history.revision.assistant_found', {})
            return true
          }

          logger.info('history.revision.initial', {})
          return false
        }

        // 中文注释：记录 history 概览与样例（用于问题排查）
        try {
          const h = Array.isArray(parsedHistory) ? parsedHistory : []
          const roles = h.map((x: any) => (typeof x?.role === 'string' ? x.role : '')).join(',')
          const nonEmptyCount = h.reduce((acc: number, x: any) => {
            const c = typeof x?.content === 'string' ? x.content : ''
            return acc + (c.trim().length >= 1 && (x?.role === 'user' || x?.role === 'assistant') ? 1 : 0)
          }, 0)
          console.log(`[history] length=${h.length}, nonEmpty=${nonEmptyCount}, roles=[${roles}]`)
          const preview = (s: string, n = 200) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n) + '...' : s) : '')
          const printItem = (idx: number, item: any) => {
            const role = typeof item?.role === 'string' ? item.role : ''
            const content = typeof item?.content === 'string' ? item.content : ''
            console.log(`[history] sample[${idx}].role=${role}, content="${preview(content)}"`)
          }
          if (h.length <= 6) { h.forEach((it, i) => printItem(i, it)) }
          else {
            h.slice(0, 3).forEach((it, i) => printItem(i, it))
            h.slice(-3).forEach((it, i) => printItem(h.length - 3 + i, it))
          }
        } catch {}

        const isRevision = isRevisionByHistory(parsedHistory)

        // 中文注释：使用 PromptLoader 加载对应提示词
        let systemPromptToUse: string
        try {
          systemPromptToUse = PromptLoader.loadPrompt(
            'circuit-agent',
            'system',
            language as 'zh' | 'en',
            isRevision ? 'revision' : 'initial'
          )
        } catch (error: any) {
          return res.status(500).json({
            error: 'Failed to load system prompt',
            details: error?.message || String(error)
          })
        }

        // 若启用了 enableSearch：执行识别轮→关键词检索→逐URL摘要→注入 extraSystems
        if (enableSearchFlag) {
          try {
            logger.info('search.pipeline.start', { progressId, searchTopN })
            const identifyUsecase = deps.identify
            const identifyResult = identifyUsecase ? await identifyUsecase.execute({
              apiUrl,
              model,
              request: { files: attachments, systemPrompt: systemPromptToUse, requirements: String(body.requirements || ''), specs: String(body.specs || ''), dialog: String(body.dialog || ''), options: { progressId }, language: language as 'zh'|'en' },
              authHeader
            }) : { keyComponents: [], keyTechRoutes: [], timeline: [] }
            logger.info('search.pipeline.identify.done', { keys: (identifyResult.keyComponents||[]).length + (identifyResult.keyTechRoutes||[]).length })
            // 改为单次请求：根据识别关键词合成查询，执行一次 singleShot（检索+摘要）
            const searchLlmTraceEntries: any[] = []
            const searchTraceFiles: string[] = []
            const searchHeaders: Record<string,string> = {}
            if (authHeader) searchHeaders['Authorization'] = authHeader
            // 统一使用「用户请求中传入的 apiUrl 与 model」作为检索轮上游参数；
            // 同时保留全局超时配置，并透传 Authorization 头。
            const cfg2 = loadConfig()
            const searchTimelineEntries: any[] = []
            // 追踪器：把检索轮发送/返回的原始信息落盘为 artifact，并写入进度 timeline
            const trace = async (evt: any) => {
              try {
                const isReq = String(evt?.direction || '') === 'request'
                const isResp = String(evt?.direction || '') === 'response'
                const target = String(evt?.target || 'query') // query | summary | single_shot
                // single_shot 使用专有步骤名；其余保持原有命名
                const step = (target === 'single_shot')
                  ? (isReq ? 'search.single_shot.request' : (isResp ? 'search.single_shot.response' : 'search.single_shot.event'))
                  : (isReq ? 'search.llm.request' : (isResp ? 'search.llm.response' : 'search.llm.event'))
                let saved: any = null
                let bodySnippet = ''
                try {
                  if (isReq) {
                    const toSave = JSON.stringify({ system: evt?.body?.system || '', messages: evt?.body?.messages || [], plugins: evt?.body?.plugins || [] })
                    bodySnippet = String(toSave || '').slice(0, 2000)
                    saved = await deps.artifact.save(toSave, 'search_llm_request', { ext: '.json', contentType: 'application/json' })
                  } else if (isResp) {
                    const raw = String((evt?.body?.raw || evt?.body?.text || '') || '')
                    bodySnippet = String(evt?.body?.text || '').slice(0, 2000)
                    saved = await deps.artifact.save(raw, 'search_llm_response', { ext: '.txt', contentType: 'text/plain' })
                  }
                } catch {}
                const entry = { step, ts: Date.now(), origin: 'backend', meta: { target, model: String(evt?.meta?.model || ''), bodySnippet }, artifacts: saved ? { [isReq ? 'search_llm_request' : 'search_llm_response']: saved } : undefined }
                searchLlmTraceEntries.push(entry)
                try { if (deps.timeline && typeof deps.timeline.push === 'function') { await deps.timeline.push(progressId, entry) } } catch {}
              } catch {}
            }
            // 使用副模型（auxModel）作为 singleShot 上游模型；优先使用 body.auxModel -> body.model
            const auxModelToUse = (body.auxModel as string) || model
            const search = new OpenRouterSearch(String(apiUrl || cfg2.openRouterBase || ''), Number(cfg2.timeouts?.llmMs || 7200000), searchHeaders, { modelOverride: auxModelToUse, forceOnline: true, trace })
            // 关键词去重（忽略大小写与前后空白）
            const keywordsRaw = ([] as string[]).concat(identifyResult.keyComponents || [], identifyResult.keyTechRoutes || [])
            const kwMap = new Map<string, string>()
            for (const k of keywordsRaw) {
              const norm = String(k || '').trim().toLowerCase()
              if (norm && !kwMap.has(norm)) kwMap.set(norm, String(k).trim())
            }
            const keywords = Array.from(kwMap.values())
            // 组装 single-shot 的查询语句
            let queryStr = ''
            if (keywords.length > 0) {
              queryStr = (language === 'zh') ? `围绕以下关键点检索并整合：${keywords.join('、')}` : `Search and consolidate around: ${keywords.join(', ')}`
            } else {
              const req = String(body.requirements || '')
              const sp = String(body.specs || '')
              const dg = String(body.dialog || '')
              queryStr = [req, sp, dg].filter(Boolean).join('\n').slice(0, 2000)
            }
            const single = await search.singleShot({ query: queryStr, topN: Math.max(1, Number(searchTopN)), lang: language as 'zh'|'en', summaryLength: 1024 })
            // 保存 single-shot 结果为 artifact
            let singleSaved: any = null
            try { singleSaved = await deps.artifact.save(JSON.stringify(single), 'search_single_shot', { ext: '.json', contentType: 'application/json' }) } catch {}
            // 写入 timeline 标记
            const ssEntry = { step: 'search.single_shot.done', ts: Date.now(), origin: 'backend', meta: { citations: single.citations?.length || 0 }, artifacts: singleSaved ? { search_single_shot: singleSaved } : undefined }
            searchTimelineEntries.push(ssEntry)
            try { if (deps.timeline && typeof deps.timeline.push === 'function') { deps.timeline.push(progressId, ssEntry).catch(() => {}) } } catch {}

            // 注入摘要到 system prompt
            const extraSystems: string[] = []
            if (single.summary && single.summary.trim()) {
              extraSystems.push((language === 'zh') ? `外部资料整合：\n${single.summary}` : `External consolidated summary:\n${single.summary}`)
            }
            const injectedSystemPrompt = (extraSystems.length > 0)
              ? `${systemPromptToUse}\n\n${extraSystems.join('\n\n')}`
              : systemPromptToUse

            const requestObj: any = {
              files: attachments,
              systemPrompt: injectedSystemPrompt,
              requirements: String(body.requirements || ''),
              specs: String(body.specs || ''),
              dialog: String(body.dialog || ''),
              history: parsedHistory,
              extraSystems,
              options: {
                progressId,
                // 此处显式关闭直评用例中的二次检索，避免重复搜索与摘要
                enableSearch: false,
                searchTopN
              }
            }
            const out = await deps.direct.execute({ apiUrl, model, request: requestObj, authHeader })
            try {
              // 将识别轮与检索轮生成的 timeline 合并入最终响应，便于前端展示完整的步骤历史
              const mergedTimeline = [] as any[]
              if (identifyResult && Array.isArray((identifyResult as any).timeline)) mergedTimeline.push(...(identifyResult as any).timeline)
              if (searchTimelineEntries.length > 0) mergedTimeline.push(...searchTimelineEntries)
              if (out && Array.isArray((out as any).timeline)) mergedTimeline.push(...(out as any).timeline)
              if (out) (out as any).timeline = mergedTimeline
              // 同步附加检索摘要（即使 artifact 保存失败也能在前端展示）
              try {
                if (Array.isArray(extraSystems) && extraSystems.length > 0) (out as any).searchSummaries = extraSystems.slice()
                if (Array.isArray(single.citations)) (out as any).citations = single.citations.slice()
              } catch {}
            } catch (e) { try { logger.warn('orchestrate.merge_timeline_failed', { error: (e as any)?.message || String(e) }) } catch {} }
            return res.json(out)
          } catch (e) {
            try { logger.error('orchestrate.structured_fetch_failed', { error: (e as any)?.message || String(e) }) } catch {}
          }
        }

        // 若未启用 enableSearch 或上述路径失败，回退到原始 direct 执行
        const out = await deps.direct.execute({
          apiUrl,
          model,
          request: {
            files: attachments,
            systemPrompt: systemPromptToUse,
            requirements: String(body.requirements || ''),
            specs: String(body.specs || ''),
            dialog: String(body.dialog || ''),
            history: parsedHistory,
            // 关闭搜索路径下不注入 extraSystems
            options: {
              progressId,
              enableSearch: enableSearchFlag,
              searchTopN
            }
          },
          authHeader
        })
        return res.json(out)
      }

      // 精细模式：固定 5 轮识别（gpt-5-mini）+ 可选搜索 + 并行评审 + 最终整合
      const enableSearch = String(body.enableSearch || 'true').toLowerCase() === 'true'
      const searchTopN = Number(body.searchTopN || 5)
      const visionModel = 'openai/gpt-5-mini'

      if (!deps.structured) return res.status(410).json({ error: 'structured mode removed; use direct mode' })
      const rec = await deps.structured.execute({ apiUrl, visionModel, images: attachments, enableSearch, searchTopN, progressId })
      const circuit: CircuitGraph = rec.circuit

      // 并行评审：当前使用单一文本模型数组（可扩展为多选）
      const models: string[] = (() => {
        try {
          return body.models ? (Array.isArray(body.models) ? body.models : JSON.parse(body.models)) : [model]
        } catch {
          return [model]
        }
      })()

      const historyParsed = (() => {
        try {
          return body.history ? (typeof body.history === 'string' ? JSON.parse(body.history) : body.history) : []
        } catch {
          return []
        }
      })()

      if (!deps.multi) return res.status(410).json({ error: 'structured mode removed; use direct mode' })
      const multi = await deps.multi.execute({
        apiUrl,
        models,
        circuit,
        systemPrompt: String(body.systemPrompt || ''),
        requirements: String(body.requirements || ''),
        specs: String(body.specs || ''),
        dialog: String(body.dialog || ''),
        history: historyParsed,
        authHeader,
        progressId
      })

      // 终稿整合：固定 openai/gpt-5
      if (!deps.aggregate) return res.status(410).json({ error: 'structured mode removed; use direct mode' })
      const agg = await deps.aggregate.execute({ apiUrl, model: 'openai/gpt-5', circuit, reports: multi.reports, systemPrompt: String(body.systemPrompt || ''), attachments: attachments.map(a => ({ name: a.name, mime: a.mime, text: tryText(a.bytes) })), authHeader, progressId })

      return res.json({ markdown: agg.markdown, timeline: [...rec.timeline, ...multi.timeline, ...agg.timeline], enriched: circuit })
    } catch (e: any) {
      res.status(502).json({ error: e?.message || 'upstream error' })
    } finally {
      try { const filesField = (req as any).files as any[] || []; filesField.forEach((f) => { try { fs.unlinkSync(f.path) } catch {} }) } catch {}
    }
  }

  function tryText(buf: Buffer): string {
    try { return buf.toString('utf8') } catch { return '' }
  }

  return { upload, handler }
}


