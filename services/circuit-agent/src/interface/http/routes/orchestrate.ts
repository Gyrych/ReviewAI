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
            const searchHeaders: Record<string,string> = {}
            if (authHeader) searchHeaders['Authorization'] = authHeader
            const search = deps.search || new OpenRouterSearch(String(process.env.OPENROUTER_BASE || ''), Number(process.env.LLM_TIMEOUT_MS || 7200000), searchHeaders)
            const keywords = ([] as string[]).concat(identifyResult.keyComponents || [], identifyResult.keyTechRoutes || [])
            const extraSystems: string[] = []
            const perKeywordLimit = Math.max(1, Math.min(5, searchTopN))
            const globalMax = Math.max(1, Math.min(10, Number(process.env.SEARCH_SUMMARY_MAX || 10)))
            if (keywords.length > 0) {
              for (const kw of keywords) {
                if (extraSystems.length >= globalMax) break
                try {
                  logger.info('search.pipeline.query', { kw })
                  const hits = await search.search(String(kw), perKeywordLimit)
                  for (const h of hits) {
                    if (extraSystems.length >= globalMax) break
                    logger.info('search.pipeline.summary', { url: h.url })
                    const summary = await search.summarizeUrl(h.url, 512, language as 'zh'|'en')
                    if (summary && summary.trim()) {
                      try { await deps.artifact.save(summary, 'search_summary', { ext: '.txt', contentType: 'text/plain' }) } catch {}
                      extraSystems.push((language === 'zh') ? `外部资料摘要（${h.title} - ${h.url}）：\n${summary}` : `External source summary (${h.title} - ${h.url}):\n${summary}`)
                    }
                  }
                } catch {}
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
                  const hits = await search.search(fallbackQ, Math.max(1, perKeywordLimit))
                  for (const h of hits) {
                    if (extraSystems.length >= globalMax) break
                    logger.info('search.pipeline.fallback.summary', { url: h.url })
                    const summary = await search.summarizeUrl(h.url, 512, language as 'zh'|'en')
                    if (summary && summary.trim()) {
                      try { await deps.artifact.save(summary, 'search_summary', { ext: '.txt', contentType: 'text/plain' }) } catch {}
                      extraSystems.push((language === 'zh') ? `外部资料摘要（${h.title} - ${h.url}）：\n${summary}` : `External source summary (${h.title} - ${h.url}):\n${summary}`)
                    }
                  }
                } catch {}
              }
            }
            logger.info('search.pipeline.done', { injected: extraSystems.length })

            const requestObj: any = {
              files: attachments,
              systemPrompt: systemPromptToUse,
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
            return res.json(out)
          } catch (e) {
            console.log('[orchestrate] structured+fetch path failed: ' + String((e as any)?.message || e))
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


