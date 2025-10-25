import type { Request, Response } from 'express'

// 中文注释：健康检查路由处理
export function healthHandler(req: Request, res: Response) {
  // 简单健康检查；可扩展为返回最近一次预热耗时与状态
  res.json({ status: 'ok', service: 'circuit-agent', endpoint: 'health' })
}


