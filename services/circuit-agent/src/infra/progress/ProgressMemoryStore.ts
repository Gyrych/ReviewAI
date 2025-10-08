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


