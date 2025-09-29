import type { Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { DirectReviewUseCase } from '../../../app/usecases/DirectReviewUseCase.js'
import type { ArtifactStore, ReviewRequest } from '../../../domain/contracts/index.js'

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

      // 组装 ReviewRequest
      const filesField = (req as any).files as any[] || []
      const files = filesField.map((f) => {
        const bytes = fs.readFileSync(f.path)
        return { name: f.originalname || f.filename, mime: f.mimetype || 'application/octet-stream', bytes }
      })
      const request: ReviewRequest = {
        files,
        systemPrompt: String(body.systemPrompt || ''),
        requirements: String(body.requirements || ''),
        specs: String(body.specs || ''),
        dialog: String(body.dialog || ''),
        history: (() => { try { return body.history ? (typeof body.history === 'string' ? JSON.parse(body.history) : body.history) : [] } catch { return [] } })(),
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


