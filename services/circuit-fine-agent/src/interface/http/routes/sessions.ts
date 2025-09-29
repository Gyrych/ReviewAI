import type { Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import type { SessionStore } from '../../../domain/contracts/index.js'

export function makeSessionsHandlers(store: SessionStore) {
  return {
    async save(req: Request, res: Response) {
      try {
        const body = req.body || {}
        const data = body.data || {}
        const id = await store.save(data)
        res.json({ id })
      } catch (e:any) { res.status(500).json({ error: e?.message || 'failed to save session' }) }
    },
    async list(req: Request, res: Response) {
      try {
        const items = await store.list()
        res.json({ items })
      } catch (e:any) { res.status(500).json({ error: e?.message || 'failed to list sessions' }) }
    },
    async read(req: Request, res: Response) {
      try {
        const id = String(req.params.id || '')
        const item = await store.read(id)
        if (!item) return res.status(404).json({ error: 'not found' })
        res.json({ item })
      } catch (e:any) { res.status(500).json({ error: e?.message || 'failed to read session' }) }
    },
    async remove(req: Request, res: Response) {
      try {
        const id = String(req.params.id || '')
        await store.delete(id)
        res.json({ ok: true })
      } catch (e:any) { res.status(500).json({ error: e?.message || 'failed to delete session' }) }
    }
  }
}


