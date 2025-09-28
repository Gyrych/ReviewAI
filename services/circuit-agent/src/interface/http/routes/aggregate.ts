import type { Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import type { CircuitGraph } from '../../../domain/contracts/index.js'
import { FinalAggregationUseCase } from '../../../app/usecases/FinalAggregationUseCase.js'

export function makeAggregateRouter(deps: { usecase: FinalAggregationUseCase; storageRoot: string }) {
  const uploadDir = path.join(deps.storageRoot, 'tmp')
  try { if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true }) } catch {}
  const upload = multer({ dest: uploadDir })

  const handler = async (req: Request, res: Response) => {
    try {
      const body = req.body || {}
      const apiUrl = String(body.apiUrl || '')
      const model = String(body.model || 'openai/gpt-5')
      const circuit: CircuitGraph = (() => { try { return typeof body.circuit === 'string' ? JSON.parse(body.circuit) : body.circuit } catch { return { components: [], nets: [] } } })()
      const reports: { model: string; markdown: string }[] = (() => { try { return typeof body.reports === 'string' ? JSON.parse(body.reports) : body.reports } catch { return [] } })()
      const systemPrompt = String(body.systemPrompt || '')
      const authHeader = req.header('authorization') || undefined
      const progressId = String(body.progressId || '') || undefined

      const filesField = (req as any).files as any[] || []
      const attachments = filesField.map((f) => ({ name: f.originalname || f.filename, mime: f.mimetype || 'application/octet-stream', text: (()=>{ try { const buf = fs.readFileSync(f.path); return buf.toString('utf8') } catch { return '' } })() }))

      const out = await deps.usecase.execute({ apiUrl, model, circuit, reports, systemPrompt, attachments, authHeader, progressId })
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


