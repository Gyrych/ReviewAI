/*
功能：运行时指标（轻量级）
用途：记录最近一次提示词预热的耗时与时间戳，供健康端点返回。
参数：
- setPreloadMetrics({ durationMs, at, ok })
- getPreloadMetrics()
返回：
- { durationMs?: number; at?: string; ok?: boolean }
示例：
// setPreloadMetrics({ durationMs: 1234, at: new Date().toISOString(), ok: true })
*/
let lastPreloadDurationMs: number | undefined
let lastPreloadAtIso: string | undefined
let lastPreloadOk: boolean | undefined

export function setPreloadMetrics(input: { durationMs?: number; at?: string; ok?: boolean }) {
  if (typeof input.durationMs === 'number') lastPreloadDurationMs = input.durationMs
  if (typeof input.at === 'string') lastPreloadAtIso = input.at
  if (typeof input.ok === 'boolean') lastPreloadOk = input.ok
}

export function getPreloadMetrics() {
  return {
    durationMs: lastPreloadDurationMs,
    at: lastPreloadAtIso,
    ok: lastPreloadOk,
  }
}


