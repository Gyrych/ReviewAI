import type { Request, Response } from 'express'
// multer types may be unavailable in some environments; import as any to avoid TS type error
// multer types may be unavailable in some environments; import as any to avoid TS type error
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import type { Attachment, CircuitGraph, ArtifactStore } from '../../../domain/contracts/index.js'
import { DirectReviewUseCase } from '../../../app/usecases/DirectReviewUseCase.js'
import { StructuredRecognitionUseCase } from '../../../app/usecases/StructuredRecognitionUseCase.js'
import { MultiModelReviewUseCase } from '../../../app/usecases/MultiModelReviewUseCase.js'
import { FinalAggregationUseCase } from '../../../app/usecases/FinalAggregationUseCase.js'
import { PromptLoader } from '../../../infra/prompts/PromptLoader.js'
import { IdentifyKeyFactsUseCase } from '../../../app/usecases/IdentifyKeyFactsUseCase.js'
import { OpenRouterSearch } from '../../../infra/search/OpenRouterSearch.js'
import type { SearchProvider } from '../../../domain/contracts/index.js'
import { logger } from '../../../infra/log/logger.js'
import { ArtifactStoreFs } from '../../../infra/storage/ArtifactStoreFs.js'
import { loadConfig } from '../../../config/config.js'

// 中文注释：统一编排入口，根据 directReview=false/true 选择流程
export function makeOrchestrateRouter(deps: {
  storageRoot: string
  artifact: ArtifactStore
  direct: DirectReviewUseCase
  structured: StructuredRecognitionUseCase
  multi: MultiModelReviewUseCase
  aggregate: FinalAggregationUseCase
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
            // 根据识别出的关键词进行检索与摘要
            // 同时收集 searchTimelineEntries，用于在最终响应中返回给前端以便展示搜索与摘要步骤
            // 搜索与 LLM 交互的细粒度日志
            const searchLlmTraceEntries: any[] = []
            // 追踪文件名数组，用于把每次 searchTimelineEntries 写入 artifact
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
                const target = String(evt?.target || 'query') // query | summary
                const step = isReq ? 'search.llm.request' : (isResp ? 'search.llm.response' : 'search.llm.event')
                let saved: any = null
                try {
                  if (isReq) {
                    const toSave = JSON.stringify({ system: evt?.body?.system || '', messages: evt?.body?.messages || [], plugins: evt?.body?.plugins || [] })
                    saved = await deps.artifact.save(toSave, 'search_llm_request', { ext: '.json', contentType: 'application/json' })
                  } else if (isResp) {
                    const raw = String((evt?.body?.raw || evt?.body?.text || '') || '')
                    saved = await deps.artifact.save(raw, 'search_llm_response', { ext: '.txt', contentType: 'text/plain' })
                  }
                } catch {}
                const entry = { step, ts: Date.now(), origin: 'backend', meta: { target, model: String(evt?.meta?.model || '') }, artifacts: saved ? { [isReq ? 'search_llm_request' : 'search_llm_response']: saved } : undefined }
                searchLlmTraceEntries.push(entry)
                try { if (deps.timeline && typeof deps.timeline.push === 'function') { await deps.timeline.push(progressId, entry) } } catch {}
              } catch {}
            }
            const search = new OpenRouterSearch(String(apiUrl || cfg2.openRouterBase || ''), Number(cfg2.timeouts?.llmMs || 7200000), searchHeaders, { modelOverride: model, forceOnline: false, trace })
            const keywords = ([] as string[]).concat(identifyResult.keyComponents || [], identifyResult.keyTechRoutes || [])
            const extraSystems: string[] = []
            const perKeywordLimit = Math.max(1, Math.min(5, searchTopN))
            const globalMax = Math.max(1, Math.min(10, Number(process.env.SEARCH_SUMMARY_MAX || 10)))
            if (keywords.length > 0) {
              for (const kw of keywords) {
                if (extraSystems.length >= globalMax) break
                try {
                  logger.info('search.pipeline.query', { kw })
                  const qEntry = { step: 'search.query', ts: Date.now(), origin: 'backend', meta: { kw } }
                  searchTimelineEntries.push(qEntry)
                  // 同步写入进度 timeline（若注入 timeline 服务）以便前端 progress API 实时可见
                  try { if (deps.timeline && typeof deps.timeline.push === 'function') { deps.timeline.push(progressId, qEntry).catch(() => {}) } } catch {}
                  // 异步保存 trace，便于离线分析（不阻塞主流程）
                  try { const fn: any = await deps.artifact.save(JSON.stringify(qEntry), 'search_trace', { ext: '.log', contentType: 'text/plain' }); if (fn && (fn.filename || fn.url)) searchTraceFiles.push(fn.filename || fn.url || String(fn)) } catch {}
                  const hits = await search.search(String(kw), perKeywordLimit)
                  for (const h of hits) {
                    if (extraSystems.length >= globalMax) break
                    logger.info('search.pipeline.summary', { url: h.url })
                    // 记录查询命中步骤
                    const hitEntry = { step: 'search.hit', ts: Date.now(), origin: 'backend', meta: { title: h.title, url: h.url } }
                    searchTimelineEntries.push(hitEntry)
                    try { if (deps.timeline && typeof deps.timeline.push === 'function') { deps.timeline.push(progressId, hitEntry).catch(() => {}) } } catch {}
                    try { const fn: any = await deps.artifact.save(JSON.stringify(hitEntry), 'search_trace', { ext: '.log', contentType: 'text/plain' }); if (fn && (fn.filename || fn.url)) searchTraceFiles.push(fn.filename || fn.url || String(fn)) } catch {}
                    const summary = await search.summarizeUrl(h.url, 512, language as 'zh'|'en')
                    if (summary && summary.trim()) {
                      try {
                        const saved = await deps.artifact.save(summary, 'search_summary', { ext: '.txt', contentType: 'text/plain' })
                        // 把保存的摘要 artifact 引用加入 timeline
                        const sumEntry = { step: 'search.summary.saved', ts: Date.now(), origin: 'backend', meta: { url: h.url, title: h.title }, artifacts: { search_summary: saved } }
                        searchTimelineEntries.push(sumEntry)
                        try { if (deps.timeline && typeof deps.timeline.push === 'function') { deps.timeline.push(progressId, sumEntry).catch(() => {}) } } catch {}
                        try { const fn: any = await deps.artifact.save(JSON.stringify(sumEntry), 'search_trace', { ext: '.log', contentType: 'text/plain' }); if (fn && (fn.filename || fn.url)) searchTraceFiles.push(fn.filename || fn.url || String(fn)) } catch {}
                      } catch (e) {
                        // 忽略保存失败，但仍记录未保存的摘要事件
                        const sumFailEntry = { step: 'search.summary', ts: Date.now(), origin: 'backend', meta: { url: h.url, title: h.title, error: (e as any)?.message || String(e) } }
                        searchTimelineEntries.push(sumFailEntry)
                        try { if (deps.timeline && typeof deps.timeline.push === 'function') { deps.timeline.push(progressId, sumFailEntry).catch(() => {}) } } catch {}
                        try { const fn: any = await deps.artifact.save(JSON.stringify(sumFailEntry), 'search_trace', { ext: '.log', contentType: 'text/plain' }); if (fn && (fn.filename || fn.url)) searchTraceFiles.push(fn.filename || fn.url || String(fn)) } catch {}
                      }
                      extraSystems.push((language === 'zh') ? `外部资料摘要（${h.title} - ${h.url}）：\n${summary}` : `External source summary (${h.title} - ${h.url}):\n${summary}`)
                    }
                  }
                } catch (e) {
                    try { logger.warn('search.pipeline.error', { kw, error: (e as any)?.message || String(e) }) } catch {}
                    // 保存异常上下文到 trace
                    try { const ex = { step: 'search.pipeline.error', ts: Date.now(), origin: 'backend', meta: { kw, error: (e as any)?.message || String(e) } }; const fn: any = await deps.artifact.save(JSON.stringify(ex), 'search_trace', { ext: '.log', contentType: 'text/plain' }); if (fn && (fn.filename || fn.url)) searchTraceFiles.push(fn.filename || fn.url || String(fn)) } catch {}
                }
              }
            } else {
              // Fallback：识别轮为空时，使用 requirements/specs/dialog 合成检索语句
              const req = String(body.requirements || '')
              const sp = String(body.specs || '')
              const dg = String(body.dialog || '')
              const fallbackQ = [req, sp, dg].filter(Boolean).join('\n').slice(0, 2000)
              logger.info('search.pipeline.fallback.query', { hasReq: !!req, hasSpecs: !!sp, hasDialog: !!dg })
              if (fallbackQ) {
                try {
                  searchTimelineEntries.push({ step: 'search.fallback.query', ts: Date.now(), origin: 'backend', meta: { query: fallbackQ } })
                  const hits = await search.search(fallbackQ, Math.max(1, perKeywordLimit))
                  for (const h of hits) {
                    if (extraSystems.length >= globalMax) break
                    logger.info('search.pipeline.fallback.summary', { url: h.url })
                    searchTimelineEntries.push({ step: 'search.hit', ts: Date.now(), origin: 'backend', meta: { title: h.title, url: h.url } })
                    const summary = await search.summarizeUrl(h.url, 512, language as 'zh'|'en')
                    if (summary && summary.trim()) {
                      try {
                        const saved = await deps.artifact.save(summary, 'search_summary', { ext: '.txt', contentType: 'text/plain' })
                        searchTimelineEntries.push({ step: 'search.summary.saved', ts: Date.now(), origin: 'backend', meta: { url: h.url, title: h.title }, artifacts: { search_summary: saved } })
                      } catch {
                        searchTimelineEntries.push({ step: 'search.summary', ts: Date.now(), origin: 'backend', meta: { url: h.url, title: h.title } })
                      }
                      extraSystems.push((language === 'zh') ? `外部资料摘要（${h.title} - ${h.url}）：\n${summary}` : `External source summary (${h.title} - ${h.url}):\n${summary}`)
                    }
                  }
                } catch (e) {
                  try { logger.warn('search.pipeline.fallback.error', { query: fallbackQ, error: (e as any)?.message || String(e) }) } catch {}
                  try { const ex = { step: 'search.pipeline.fallback.error', ts: Date.now(), origin: 'backend', meta: { query: fallbackQ, error: (e as any)?.message || String(e) } }; const fn: any = await deps.artifact.save(JSON.stringify(ex), 'search_trace', { ext: '.log', contentType: 'text/plain' }); if (fn && (fn.filename || fn.url)) searchTraceFiles.push(fn.filename || fn.url || String(fn)) } catch {}
                }
              }
            }
            logger.info('search.pipeline.done', { injected: extraSystems.length })
            // 确保所有收集到的 searchTimelineEntries 与 searchLlmTraceEntries 都被写入进度存储（progress），以便前端轮询能看到这些步骤
            try {
              if (deps.timeline && typeof deps.timeline.push === 'function') {
                for (const e of searchTimelineEntries) {
                  try { await deps.timeline.push(progressId, e) } catch {}
                }
                for (const e of searchLlmTraceEntries) {
                  try { await deps.timeline.push(progressId, e) } catch {}
                }
              }
            } catch {}
            // 将本次关键词检索的 trace 汇总为一个 artifact，便于前端或运维下载分析
            try {
              if (searchTraceFiles.length > 0) {
                try {
                  const savedSummary: any = await deps.artifact.save(JSON.stringify({ ts: Date.now(), traceFiles: searchTraceFiles, count: searchTraceFiles.length }), 'search_trace_summary', { ext: '.json', contentType: 'application/json' })
                  // 把 trace summary 引用加入到 searchTimelineEntries，便于返回给前端
                  searchTimelineEntries.push({ step: 'search.trace.summary.saved', ts: Date.now(), origin: 'backend', artifacts: { search_trace_summary: savedSummary } })
                } catch {}
              }
            } catch {}

            // 为确保检索得到的摘要一定注入到发送给上游的 system prompt 中，
            // 同时保留 extraSystems 字段供下游用例使用。
            const injectedSystemPrompt = (Array.isArray(extraSystems) && extraSystems.length > 0)
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
                enableSearch: enableSearchFlag,
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
                if (Array.isArray(extraSystems) && extraSystems.length > 0) {
                  (out as any).searchSummaries = extraSystems.slice()
                }
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


