export function loadConfig() {
    const env = process.env;
    const cfg = {
        port: Number(env.PORT || 4002),
        basePath: '/api/v1/circuit-fine-agent',
        openRouterBase: String(env.OPENROUTER_BASE || 'https://openrouter.ai/api/v1/chat/completions'),
        redisUrl: String(env.REDIS_URL || 'redis://localhost:6379'),
        timeouts: {
            llmMs: Number(env.LLM_TIMEOUT_MS || 7200000),
            visionMs: Number(env.VISION_TIMEOUT_MS || 7200000)
        },
        fetchRetries: Number(env.FETCH_RETRIES || 1),
        keepAliveMsecs: Number(env.KEEP_ALIVE_MSECS || 60000),
        storageRoot: String(env.STORAGE_ROOT || 'services/circuit-fine-agent/storage')
    };
    return cfg;
}
