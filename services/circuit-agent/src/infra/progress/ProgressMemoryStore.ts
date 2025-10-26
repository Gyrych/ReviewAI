/*
功能：进度存储（内存实现）
用途：开发/无 Redis 环境下记录会话时间线，便于前端查询。
参数：
- init(id)
- push(id, item)
- get(id)
返回：
- Promise<void> 或 TimelineItem[]
示例：
// const store = new ProgressMemoryStore(); await store.init(id); await store.push(id, item)
*/
import type { ProgressStore, TimelineItem } from '../../domain/contracts/index.js'

// 中文注释：简单内存实现，适用于开发环境或未配置 Redis 时的回退
export class ProgressMemoryStore implements ProgressStore {
  private store: Map<string, TimelineItem[]> = new Map()

  async init(id: string): Promise<void> {
    if (!id) return
    if (!this.store.has(id)) this.store.set(id, [])
  }

  async push(id: string, item: TimelineItem): Promise<void> {
    if (!id) return
    const arr = this.store.get(id)
    if (arr) arr.push(item)
    else this.store.set(id, [item])
  }

  async get(id: string): Promise<TimelineItem[]> {
    return this.store.get(id) || []
  }

  async clear(id: string): Promise<void> {
    this.store.delete(id)
  }
}


