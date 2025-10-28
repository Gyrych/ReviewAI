import { Request, Response, NextFunction } from 'express'

// 简单的请求级超时中间件，支持 soft/hard 超时（毫秒）
export function timeoutMiddleware(options?: { softMs?: number; hardMs?: number }) {
  const softMs = options?.softMs ?? 30_000
  const hardMs = options?.hardMs ?? 60_000
  return (req: Request, res: Response, next: NextFunction) => {
    let softTimer: NodeJS.Timeout | null = setTimeout(() => {
      // 软超时：记录警告但不关闭连接
      console.warn(`[timeoutMiddleware] soft timeout ${softMs}ms for ${req.method} ${req.path}`)
      // 可在此处发送事件/度量
    }, softMs)

    const hardTimer = setTimeout(() => {
      console.error(`[timeoutMiddleware] hard timeout ${hardMs}ms for ${req.method} ${req.path}`)
      try { res.status(504).json({ error: 'request timeout' }) } catch {}
      // 强制结束请求
      if (softTimer) { clearTimeout(softTimer); softTimer = null }
    }, hardMs)

    res.on('finish', () => {
      if (softTimer) { clearTimeout(softTimer); softTimer = null }
      clearTimeout(hardTimer)
    })

    next()
  }
}


