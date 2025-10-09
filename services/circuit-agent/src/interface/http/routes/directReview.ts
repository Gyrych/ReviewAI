import type { Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { DirectReviewUseCase } from '../../../app/usecases/DirectReviewUseCase.js'
import type { ArtifactStore, ReviewRequest } from '../../../domain/contracts/index.js'
import { PromptLoader } from '../../../infra/prompts/PromptLoader.js'

// 中文注释：多文件上传中间件（临时落盘后读取 Buffer，再删除）
export function makeDirectReviewRouter(deps: {
  usecase: DirectReviewUseCase
  artifact: ArtifactStore
  storageRoot: string
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

      // 中文注释：读取 language 参数（默认 'zh'），验证合法性
      const language = String(body.language || 'zh')
      if (!['zh', 'en'].includes(language)) {
        return res.status(400).json({ error: 'Invalid language parameter. Must be "zh" or "en".' })
      }

      // 中文注释：解析 history（数组或 JSON 字符串）
      const history = (() => {
        try {
          return body.history ? (typeof body.history === 'string' ? JSON.parse(body.history) : body.history) : []
        } catch {
          return []
        }
      })()

      // 中文注释：根据报告片段与非空消息判断是否为修订轮，并记录摘要日志
      function isRevisionByHistory(h: any[]): boolean {
        // 更严格的修订判定：仅当历史中包含 assistant 条目（表示模型已产出报告）
        // 或者显式包含报告/修订标记时，才认为是修订轮。
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

        // 否则不是修订轮
        console.log('[isRevisionByHistory] no assistant messages or report markers found; treating as initial')
        return false
      }

      // 中文注释：记录 history 概览与样例（用于问题排查）
      try {
        const h = Array.isArray(history) ? history : []
        const roles = h.map((x: any) => (typeof x?.role === 'string' ? x.role : '')).join(',')
        const nonEmptyCount = h.reduce((acc: number, x: any) => {
          const c = typeof x?.content === 'string' ? x.content : ''
          return acc + (c.trim().length >= 1 && (x?.role === 'user' || x?.role === 'assistant') ? 1 : 0)
        }, 0)
        console.log(`[history] length=${h.length}, nonEmpty=${nonEmptyCount}, roles=[${roles}]`)
        const preview = (s: string, n = 200) => {
          if (typeof s !== 'string') return ''
          return s.length > n ? s.slice(0, n) + '...' : s
        }
        const printItem = (idx: number, item: any) => {
          const role = typeof item?.role === 'string' ? item.role : ''
          const content = typeof item?.content === 'string' ? item.content : ''
          console.log(`[history] sample[${idx}].role=${role}, content="${preview(content)}"`)
        }
        if (h.length <= 6) {
          h.forEach((it, i) => printItem(i, it))
        } else {
          h.slice(0, 3).forEach((it, i) => printItem(i, it))
          h.slice(-3).forEach((it, i) => printItem(h.length - 3 + i, it))
        }
      } catch {}

      const isRevision = isRevisionByHistory(history)

      // 中文注释：使用 PromptLoader 加载对应提示词
      let systemPrompt: string
      try {
        systemPrompt = PromptLoader.loadPrompt(
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

      // 组装 ReviewRequest
      const filesField = (req as any).files as any[] || []
      const files = filesField.map((f) => {
        const bytes = fs.readFileSync(f.path)
        return { name: f.originalname || f.filename, mime: f.mimetype || 'application/octet-stream', bytes }
      })
      const request: ReviewRequest = {
        files,
        systemPrompt,  // 使用加载的提示词
        requirements: String(body.requirements || ''),
        specs: String(body.specs || ''),
        dialog: String(body.dialog || ''),
        history,
        options: { progressId: String(body.progressId || '' ) || undefined }
      }

      const out = await deps.usecase.execute({ apiUrl, model, request, authHeader })
      res.json(out)
    } catch (e: any) {
      res.status(502).json({ error: e?.message || 'upstream error' })
    } finally {
      try {
        const filesField = (req as any).files as any[] || []
        filesField.forEach((f) => { try { fs.unlinkSync(f.path) } catch {} })
      } catch {}
    }
  }

  return { upload, handler }
}


