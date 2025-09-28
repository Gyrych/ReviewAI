import type { ProgressStore, TimelineItem } from '../../domain/contracts/index.js'

// 中文注释：统一时间线写入与构造
export class TimelineService {
  constructor(private progress: ProgressStore) {}

  make(step: string, meta?: any): TimelineItem {
    return { step, ts: Date.now(), origin: 'agent', category: 'state', meta: meta || {} }
  }

  async push(progressId: string|undefined, item: TimelineItem) {
    if (!progressId) return
    try { await this.progress.push(progressId, item) } catch {}
  }
}


