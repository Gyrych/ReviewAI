/**
 * 轻量指标服务（仅供本地开发与测试）
 *
 * 提供简单的计数器接口：incrementMetric、getMetric、resetMetrics。
 * 生产环境应替换为 Prometheus/StatsD/云监控等实现。
 */
const counters: Record<string, number> = {}

export function incrementMetric(name: string, value = 1): void {
  try {
    // @ts-ignore
    counters[name] = (counters[name] || 0) + value
  } catch {}
}

export function getMetric(name: string): number {
  // @ts-ignore
  return counters[name] || 0
}

export function resetMetrics(): void {
  Object.keys(counters).forEach(k => { delete counters[k] })
}

export default { incrementMetric, getMetric, resetMetrics }


