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
import { ArtifactStoreFs } from '../../../infra/storage/ArtifactStoreFs.js'

// 中文注释：统一编排入口，根据 directReview=false/true 选择流程
export function makeOrchestrateRouter(deps: {
  storageRoot: string
  artifact: ArtifactStore
  direct: DirectReviewUseCase
  structured: StructuredRecognitionUseCase
  multi: MultiModelReviewUseCase
  aggregate: FinalAggregationUseCase
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
                console.log('[isRevisionByHistory] matched report marker in history item, treating as revision')
                return true
              }
            } catch (e) {}
          }

          if (hasAssistantMessage) {
            console.log('[isRevisionByHistory] found assistant message in history, treating as revision')
            return true
          }

          console.log('[isRevisionByHistory] no assistant messages or report markers found; treating as initial')
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

        // 若启用了 enableSearch，则先执行结构化识别并尝试抓取 datasheet
        if (enableSearchFlag) {
          try {
            // 调用 StructuredRecognitionUseCase（复用已注入的 structured via deps）
            const rec = await deps.structured.execute({ apiUrl, visionModel: String(process.env.DEFAULT_VISION_MODEL || 'openai/gpt-5-mini'), images: attachments, enableSearch: true, searchTopN, progressId })
            // 将结构化结果保存到请求的 enrichedJson 中，供后续 DirectReviewUseCase 使用
            const enrichedJson: any = { circuit: rec.circuit }
            // 收集 datasheet URLs
            const urls: string[] = []
            try {
              if (rec.circuit && Array.isArray((rec.circuit as any).datasheetMeta)) {
                for (const d of (rec.circuit as any).datasheetMeta) {
                  try { if (d && d.sourceUrl) urls.push(String(d.sourceUrl)) } catch {}
                }
              }
            } catch {}

            // 若有 urls，尝试抓取并保存为 artifact（非阻塞失败）
            if (urls.length > 0) {
              try {
                const { fetchAndSaveDatasheets } = await import('../../../infra/datasheet/DatasheetFetcher.js')
                const artifactStore = deps.artifact
                if (typeof fetchAndSaveDatasheets === 'function' && artifactStore) {
                  const saved = await fetchAndSaveDatasheets(urls, artifactStore, { timeoutMs: Number(process.env.DATASHEET_FETCH_TIMEOUT_MS || 15000), maxBytes: Number(process.env.DATASHEET_MAX_BYTES || 5000000) })
                  if (Array.isArray(saved) && saved.length > 0) enrichedJson.datasheets = saved
                }
              } catch (e) {
                console.log('[orchestrate] datasheet fetch failed: ' + String((e as any)?.message || e))
              }
            }

            const requestObj: any = {
              files: attachments,
              systemPrompt: systemPromptToUse,
              requirements: String(body.requirements || ''),
              specs: String(body.specs || ''),
              dialog: String(body.dialog || ''),
              history: parsedHistory,
              options: {
                progressId,
                enableSearch: enableSearchFlag,
                searchTopN
              }
            }
            if (enrichedJson) requestObj.enrichedJson = enrichedJson
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


