import type { Request, Response } from 'express'
import type { ProgressStore } from '../../../domain/contracts/index.js'

// 独立实现 makeProgressHandler，避免跨包相对导入导致模块解析错误
export function makeProgressHandler(store: ProgressStore) {
  return async function progressHandler(req: Request, res: Response) {
    try {
      const id = String(req.params.id || '')
      const timeline = await store.get(id)
      res.json({ timeline })
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'failed to read progress' })
    }
  }
}


