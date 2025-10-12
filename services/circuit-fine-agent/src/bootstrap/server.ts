import express from 'express'
import dotenv from 'dotenv'
import { loadConfig } from '../config/config'
import { healthHandler } from '../interface/http/routes/health'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
import cors from 'cors'
import { ProgressMemoryStore } from '../infra/progress/ProgressMemoryStore'
import { ProgressRedisStore } from '../infra/progress/ProgressRedisStore'
import { makeProgressHandler } from '../interface/http/routes/progress'
import { ArtifactStoreFs } from '../infra/storage/ArtifactStoreFs'
import { TimelineService } from '../app/services/TimelineService'
import { OpenRouterVisionChat } from '../infra/providers/OpenRouterVisionChat'
import { DirectReviewUseCase } from '../app/usecases/DirectReviewUseCase'
import { makeDirectReviewRouter } from '../interface/http/routes/directReview'
import { OpenRouterSearch } from '../infra/search/OpenRouterSearch'
import { OpenRouterVisionProvider } from '../infra/providers/OpenRouterVisionProvider'
import { OpenRouterTextProvider } from '../infra/providers/OpenRouterTextProvider'
// structured/multi/aggregate usecases retired; imports removed
import { makeOrchestrateRouter } from '../interface/http/routes/orchestrate'
import { SessionStoreFs } from '../infra/storage/SessionStoreFs'
import { makeSessionsHandlers } from '../interface/http/routes/sessions'

// 简化：此文件基于 circuit-agent 的实现复制，后续应根据需要调整 usecases/providers
dotenv.config()
const cfg = loadConfig()
const PORT = cfg.port
const BASE_PATH = cfg.basePath

const app = express()

// 中文注释：启用严格来源白名单的 CORS，仅放行前端开发地址，并允许 Authorization 以透传上游模型 API
const corsOptions = {
  origin: ['http://localhost:3002', 'http://127.0.0.1:3002', 'http://localhost:3003', 'http://127.0.0.1:3003', 'http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  optionsSuccessStatus: 204,
  credentials: false,
  maxAge: 86400,
}
app.use(cors(corsOptions))
// 中文注释：显式处理预检请求，确保返回允许的跨域响应头
app.options('*', cors(corsOptions))

app.use(express.json({ limit: '200mb' }))
app.use((req, res, next) => { try { next() } catch (e:any) { res.status(500).json({ error: 'internal error' }) } })

app.get(`${BASE_PATH}/health`, healthHandler)

let progressStore: any = new ProgressMemoryStore()
;(async () => {
  try {
    const redisMod: any = await import('redis')
    const createClient = redisMod.createClient
    const client = createClient({ url: cfg.redisUrl })
    await client.connect()
    progressStore = new ProgressRedisStore(client, { ttlSeconds: 24 * 60 * 60 })
    console.log('[circuit-fine-agent] Progress store: Redis')
  } catch (e:any) { console.log('[circuit-fine-agent] Progress store: Memory (fallback)', e?.message || '') }
})()

app.get(`${BASE_PATH}/progress/:id`, makeProgressHandler(progressStore))

app.get(`${BASE_PATH}/system-prompt`, (req, res) => {
  try {
    const lang = String(req.query.lang || 'zh')
    const filename = lang === 'en' ? 'SystemPrompt.md' : '系统提示词.md'
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..')
    const preferred = path.resolve(repoRoot, 'ReviewAIPrompt', filename)
    const fallback = path.resolve(repoRoot, filename)
    const p = fs.existsSync(preferred) ? preferred : (fs.existsSync(fallback) ? fallback : '')
    if (!p) return res.status(404).type('application/json').send(JSON.stringify({ error: 'system prompt not found' }))
    const txt = fs.readFileSync(p, 'utf8')
    res.type('text/plain').send(txt)
  } catch (e) { res.status(500).json({ error: 'failed to read system prompt' }) }
})

// NOTE: reusing many implementations from circuit-agent; these imports assume shared code or will be adjusted later
const artifact = new ArtifactStoreFs(cfg.storageRoot)
const timeline = new TimelineService(progressStore)
const vision = new OpenRouterVisionChat(cfg.openRouterBase, cfg.timeouts.llmMs)
// instantiate direct review usecase locally; cast to any when passing across orchestrator to avoid TS private-field mismatch
const directReviewLocal = new DirectReviewUseCase(vision, artifact, timeline)
const { upload, handler } = makeDirectReviewRouter({ usecase: directReviewLocal as any, artifact, storageRoot: cfg.storageRoot })
app.post(`${BASE_PATH}/modes/direct/review`, upload.any(), handler)

const search = new OpenRouterSearch(cfg.openRouterBase, cfg.timeouts.llmMs)
const visionProvider = new OpenRouterVisionProvider(cfg.openRouterBase, cfg.timeouts.visionMs)
// 入口保护：structured 模式已退役。为保证兼容性，返回 410 并提示使用 direct 模式。
app.post(`${BASE_PATH}/modes/structured/recognize`, (req, res) => res.status(410).json({ error: 'structured mode removed; use direct mode' }))
app.post(`${BASE_PATH}/modes/structured/review`, (req, res) => res.status(410).json({ error: 'structured mode removed; use direct mode' }))
app.post(`${BASE_PATH}/modes/structured/aggregate`, (req, res) => res.status(410).json({ error: 'structured mode removed; use direct mode' }))

// structured/multi/aggregate retired — only pass present deps to orchestrator
// cast to any to avoid cross-service type incompatibilities between local DirectReviewUseCase declarations
const orch = makeOrchestrateRouter({ storageRoot: cfg.storageRoot, direct: (directReviewLocal as any), timeline, search } as any)
app.post(`${BASE_PATH}/orchestrate/review`, orch.upload.any(), orch.handler)

const sessions = new SessionStoreFs(cfg.storageRoot)
const sess = makeSessionsHandlers(sessions)
app.post(`${BASE_PATH}/sessions/save`, express.json(), sess.save)
app.get(`${BASE_PATH}/sessions/list`, sess.list)
app.get(`${BASE_PATH}/sessions/:id`, sess.read)
app.delete(`${BASE_PATH}/sessions/:id`, sess.remove)

app.listen(PORT, () => {
  console.log(`[circuit-fine-agent] listening on http://localhost:${PORT}${BASE_PATH}/health`)
})


