// 中文注释：简单的进度存储（内存 Map），用于实时轮询获取 timeline

type TimelineItem = { step: string; ts?: number; meta?: any }

const store: Map<string, TimelineItem[]> = new Map()

export function initProgress(id: string) {
  if (!id) return
  if (!store.has(id)) store.set(id, [])
}

export function pushProgress(id: string, item: TimelineItem) {
  if (!id) return
  const arr = store.get(id)
  if (!arr) { store.set(id, [item]); return }
  arr.push(item)
}

export function getProgress(id: string): TimelineItem[] {
  return store.get(id) || []
}

export function clearProgress(id: string) {
  if (!id) return
  store.delete(id)
}


