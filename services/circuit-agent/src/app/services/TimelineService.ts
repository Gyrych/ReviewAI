import type { ProgressStore, TimelineItem } from '../../domain/contracts/index.js'

// 中文注释：统一时间线写入与构造
export class TimelineService {
  constructor(private progress: ProgressStore) {}

  // 中文注释：允许通过可选参数覆盖 origin/category，以便更准确标注来源与类别
  make(step: string, meta?: any, opts?: { origin?: 'agent'|'external'|'frontend'|'backend'; category?: string }): TimelineItem {
    const origin = (opts && opts.origin) ? opts.origin : 'agent'
    const category = (opts && opts.category) ? opts.category : 'state'
    return { step, ts: Date.now(), origin, category, meta: meta || {} }
  }

  async push(progressId: string|undefined, item: TimelineItem) {
    if (!progressId) return
    try { await this.progress.push(progressId, item) } catch {}
  }
}


