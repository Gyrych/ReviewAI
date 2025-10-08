import type { Request, Response } from 'express'
import type { SessionStore } from '../../../domain/contracts/index.js'

export function makeSessionsHandlers(store: SessionStore) {
  return {
    save: async (req: Request, res: Response) => {
      try {
        const payload = req.body || {}
        const meta = await store.save(payload)
        res.json(meta)
      } catch (e: any) { res.status(500).json({ error: e?.message || 'failed to save' }) }
    },
    list: async (req: Request, res: Response) => {
      try {
        const lim = Math.max(1, Math.min(100, Number(req.query.limit || 10)))
        const items = await store.list(lim)
        res.json({ items })
      } catch (e: any) { res.status(500).json({ error: e?.message || 'failed to list' }) }
    },
    read: async (req: Request, res: Response) => {
      try { const id = String(req.params.id || ''); const data = await store.load(id); res.json(data) } catch (e: any) { res.status(/not found/i.test(String(e?.message)) ? 404 : 500).json({ error: e?.message || 'failed to read' }) }
    },
    remove: async (req: Request, res: Response) => {
      try { const id = String(req.params.id || ''); await store.remove(id); res.json({ ok: true }) } catch (e: any) { res.status(500).json({ error: e?.message || 'failed to delete' }) }
    }
  }
}


