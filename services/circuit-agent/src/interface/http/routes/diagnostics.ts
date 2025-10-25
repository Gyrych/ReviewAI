import { Router, Request, Response } from 'express'
import path from 'path'
import { ArtifactStoreFs } from '../../../infra/storage/ArtifactStoreFs.js'
import { loadConfig } from '../../../config/config.js'

/**
 * 诊断导出路由
 * - 接收 sessionId、includeResponses
 * - 生成诊断 JSON 工件并返回 artifactUrl
 */
export function makeDiagnosticsRouter() {
  const router = Router()
  const cfg = loadConfig()
  const store = new ArtifactStoreFs(cfg.storageRoot)

  router.post('/api/v1/circuit-agent/diagnostics/export', async (req: Request, res: Response) => {
    try {
      const body = req.body || {}
      const sessionId = String(body.sessionId || '')
      const includeResponses = String(body.includeResponses || 'false').toLowerCase() === 'true'
      if (!sessionId) {
        return res.status(400).json({ code: 'BAD_REQUEST', message: '缺少必要参数 sessionId', details: { missing: ['sessionId'] } })
      }

      // 最小实现：打包基础诊断信息（避免敏感字段）
      const payload = {
        sessionId,
        includeResponses,
        generatedAt: new Date().toISOString()
      }
      const saved = await store.save(JSON.stringify(payload), `diagnostics-${sessionId}`, { ext: '.json', contentType: 'application/json' })
      return res.status(201).json({ artifactUrl: saved.url })
    } catch (e: any) {
      return res.status(500).json({ code: 'INTERNAL_ERROR', message: '导出诊断失败', details: { error: e?.message || String(e) } })
    }
  })

  return router
}


