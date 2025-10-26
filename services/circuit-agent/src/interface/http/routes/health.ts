import type { Request, Response } from 'express'
import { getPreloadMetrics } from '../../../infra/metrics/runtimeMetrics'

// 中文注释：健康检查路由处理
export function healthHandler(req: Request, res: Response) {
  const preload = getPreloadMetrics()
  res.json({ status: 'ok', service: 'circuit-agent', endpoint: 'health', preload })
}


