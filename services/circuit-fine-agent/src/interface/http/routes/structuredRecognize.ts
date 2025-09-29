import type { Request, Response } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import type { StructuredRecognitionUseCase } from '../../../app/usecases/StructuredRecognitionUseCase.js'

export function makeStructuredRecognizeRouter(deps: { usecase: StructuredRecognitionUseCase, storageRoot: string }) {
  const uploadDir = path.join(deps.storageRoot, 'tmp')
  try { if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true }) } catch {}
  const upload = multer({ dest: uploadDir })

  const handler = async (req: Request, res: Response) => {
    try {
      const filesField = (req as any).files as any[] || []
      const attachments = filesField.map((f) => ({ name: f.originalname || f.filename, mime: f.mimetype || 'application/octet-stream', bytes: fs.readFileSync(f.path) }))
      const body = req.body || {}
      const apiUrl = String(body.apiUrl || '')
      const visionModel = String(body.visionModel || '')
      const enableSearch = String(body.enableSearch || 'true').toLowerCase() === 'true'
      const searchTopN = Number(body.searchTopN || 5)
      const out = await deps.usecase.execute({ apiUrl, visionModel, images: attachments, enableSearch, searchTopN })
      res.json(out)
    } catch (e:any) { res.status(502).json({ error: e?.message || 'upstream error' }) } finally { try { const filesField = (req as any).files as any[] || []; filesField.forEach((f) => { try { fs.unlinkSync(f.path) } catch {} }) } catch {} }
  }

  return { upload, handler }
}


