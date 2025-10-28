import { Request, Response, NextFunction } from 'express'

// 简单 RBAC 中间件示例，依赖 req.headers['x-user-role']
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const r = String(req.headers['x-user-role'] || '')
    if (r !== role) return res.status(403).json({ error: 'forbidden' })
    next()
  }
}


