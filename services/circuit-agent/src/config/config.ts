// 中文注释：集中配置读取，提供默认值，避免在业务代码中直接访问 process.env

export type ServiceConfig = {
  port: number
  basePath: string
  openRouterBase: string
  redisUrl: string
  timeouts: { llmMs: number; visionMs: number }
  fetchRetries: number
  keepAliveMsecs: number
  storageRoot: string
}

export function loadConfig(): ServiceConfig {
  const env = process.env
  const cfg: ServiceConfig = {
    port: Number(env.PORT || 4001),
    basePath: '/api/v1/circuit-agent',
    openRouterBase: String(env.OPENROUTER_BASE || 'https://openrouter.ai/api/v1/chat/completions'),
    redisUrl: String(env.REDIS_URL || 'redis://localhost:6379'),
    timeouts: {
      llmMs: Number(env.LLM_TIMEOUT_MS || 7200000),
      visionMs: Number(env.VISION_TIMEOUT_MS || 7200000)
    },
    fetchRetries: Number(env.FETCH_RETRIES || 1),
    keepAliveMsecs: Number(env.KEEP_ALIVE_MSECS || 60000),
    storageRoot: String(env.STORAGE_ROOT || 'services/circuit-agent/storage')
  }
  return cfg
}


