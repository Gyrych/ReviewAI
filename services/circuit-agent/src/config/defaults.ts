/**
 * 默认配置：RoundConfig 等默认值
 *
 * 说明：为请求级别的 round 配置提供默认值，供中间件与路由使用。
 */
export const RoundConfigDefaults = {
  enable_search: false,
  engine: 'auto',
  max_results: 5,
  context_scale: 'high',
  timeout_ms: 30000,
}

export type RoundConfig = Partial<typeof RoundConfigDefaults>

export default { RoundConfigDefaults }


