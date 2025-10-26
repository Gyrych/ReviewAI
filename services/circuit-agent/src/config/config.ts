// 中文注释：集中配置读取，提供默认值，避免在业务代码中直接访问 process.env
/*
功能：配置加载（loadConfig）
用途：集中读取环境变量/默认值，避免业务层直接访问 process.env；提供严格预加载等特性开关。
参数：
- 无（通过 process.env 读取）
返回：
- ServiceConfig 含端口、基础路径、超时、重试、存储位置、严格预热等字段
示例：
// const cfg = loadConfig(); console.log(cfg.port)
*/
import fs from 'fs'
import path from 'path'

export type ServiceConfig = {
  port: number
  basePath: string
  openRouterBase: string
  redisUrl: string
  timeouts: { llmMs: number; visionMs: number }
  fetchRetries: number
  keepAliveMsecs: number
  storageRoot: string
  promptPreloadStrict: boolean
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
    storageRoot: String(env.STORAGE_ROOT || 'services/circuit-agent/storage'),
    // 注意：服务端仍强制严格预热；此开关仅供外部预检脚本/工具读取
    promptPreloadStrict: String(env.PROMPT_PRELOAD_STRICT || 'true').toLowerCase() !== 'false'
  }
  return cfg
}


// 中文注释：校验运行时关键配置的可用性与完整性。
// 返回错误消息数组；若数组为空表示校验通过。
export function validateRuntimeConfig(cfg?: ServiceConfig): string[] {
  const errors: string[] = []
  const env = process.env

  // 要求在 CI/生产环境中显式提供 OPENROUTER_BASE，避免隐式默认值带来不可预期行为
  if (!env.OPENROUTER_BASE || String(env.OPENROUTER_BASE).trim() === '') {
    errors.push('Missing OPENROUTER_BASE: must be provided as an environment variable')
  }

  // storageRoot 必须在文件系统中存在（避免运行时写入失败）
  const storageRoot = cfg?.storageRoot || env.STORAGE_ROOT || ''
  if (!storageRoot || String(storageRoot).trim() === '') {
    errors.push('Missing STORAGE_ROOT: storage root path must be configured')
  } else {
    try {
      const resolved = path.resolve(storageRoot)
      if (!fs.existsSync(resolved)) {
        errors.push(`STORAGE_ROOT path does not exist: ${resolved}`)
      }
    } catch (e: any) {
      errors.push(`Failed to validate STORAGE_ROOT: ${String(e?.message || e)}`)
    }
  }

  // REDIS_URL 可选，但若存在应为合法 URL，scheme 应为 redis: 或 rediss:
  if (env.REDIS_URL && String(env.REDIS_URL).trim() !== '') {
    try {
      const u = new URL(String(env.REDIS_URL))
      if (!(u.protocol === 'redis:' || u.protocol === 'rediss:')) {
        errors.push('REDIS_URL appears invalid: scheme must be redis:// or rediss://')
      }
    } catch (e) {
      // 尝试兼容常见 redis://host:port 写法
      const v = String(env.REDIS_URL)
      if (!v.startsWith('redis://') && !v.startsWith('rediss://')) {
        errors.push('REDIS_URL is not a valid URL (expected redis://host:port)')
      }
    }
  }

  return errors
}

