import type { Request, Response } from 'express'

// 中文注释：健康检查路由处理
export function healthHandler(req: Request, res: Response) {
  res.json({ status: 'ok', service: 'circuit-agent', endpoint: 'health' })
}


