import type { Request, Response } from 'express'

// 简单独立的健康检查处理器，避免交叉导入导致模块解析错误
export function healthHandler(req: Request, res: Response) {
  res.json({ status: 'ok', service: 'circuit-fine-agent', endpoint: 'health' })
}


