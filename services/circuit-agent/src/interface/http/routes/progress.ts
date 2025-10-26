/*
功能：进度查询路由
用途：查询某进度 ID 的时间线，供前端轮询或按需获取。
参数：
- makeProgressHandler(store)
返回：
- (req,res)=>Promise<void> Express 处理函数
示例：
// app.get('/progress/:id', makeProgressHandler(store))
*/
import type { Request, Response } from 'express'
import type { ProgressStore } from '../../../domain/contracts/index.js'

// 中文注释：进度查询路由；从依赖注入的 store 获取时间线
export function makeProgressHandler(store: ProgressStore) {
  return async function progressHandler(req: Request, res: Response) {
    try {
      const id = String(req.params.id || '')
      const timeline = await store.get(id)
      res.json({ timeline })
    } catch (e) {
      res.status(500).json({ error: 'failed to read progress' })
    }
  }
}


