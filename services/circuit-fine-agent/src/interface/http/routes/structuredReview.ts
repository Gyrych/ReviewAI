import type { Request, Response } from 'express'
import type { MultiModelReviewUseCase } from '../../../app/usecases/MultiModelReviewUseCase.js'

export function makeStructuredReviewHandler(usecase: MultiModelReviewUseCase) {
  return async function structuredReviewHandler(req: Request, res: Response) {
    try {
      const body = req.body || {}
      const apiUrl = String(body.apiUrl || '')
      const models = (() => { try { return body.models ? (Array.isArray(body.models) ? body.models : JSON.parse(body.models)) : [] } catch { return [] } })()
      const circuit = body.circuit || {}
      const history = (() => { try { return body.history ? (typeof body.history === 'string' ? JSON.parse(body.history) : body.history) : [] } catch { return [] } })()
      const out = await usecase.execute({ apiUrl, models, circuit, systemPrompt: String(body.systemPrompt || ''), requirements: String(body.requirements || ''), specs: String(body.specs || ''), dialog: String(body.dialog || ''), history, authHeader: req.header('authorization') || undefined })
      res.json(out)
    } catch (e:any) { res.status(502).json({ error: e?.message || 'upstream error' }) }
  }
}


