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
import { DuckDuckGoHtmlSearch } from '../infra/search/DuckDuckGoHtmlSearch'
import { OpenRouterVisionProvider } from '../infra/providers/OpenRouterVisionProvider'
import { StructuredRecognitionUseCase } from '../app/usecases/StructuredRecognitionUseCase'
import { makeStructuredRecognizeRouter } from '../interface/http/routes/structuredRecognize'
import { OpenRouterTextProvider } from '../infra/providers/OpenRouterTextProvider'
import { MultiModelReviewUseCase } from '../app/usecases/MultiModelReviewUseCase'
import { makeStructuredReviewHandler } from '../interface/http/routes/structuredReview'
import { FinalAggregationUseCase } from '../app/usecases/FinalAggregationUseCase'
import { makeAggregateRouter } from '../interface/http/routes/aggregate'
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
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'] as const,
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
const directReview = new DirectReviewUseCase(vision, artifact, timeline)
const { upload, handler } = makeDirectReviewRouter({ usecase: directReview, artifact, storageRoot: cfg.storageRoot })
app.post(`${BASE_PATH}/modes/direct/review`, upload.any(), handler)

const search = new DuckDuckGoHtmlSearch()
const visionProvider = new OpenRouterVisionProvider(cfg.openRouterBase, cfg.timeouts.visionMs)
const structured = new StructuredRecognitionUseCase(visionProvider, search, timeline)
const sr = makeStructuredRecognizeRouter({ usecase: structured, storageRoot: cfg.storageRoot })
app.post(`${BASE_PATH}/modes/structured/recognize`, sr.upload.any(), sr.handler)

const textLlm = new OpenRouterTextProvider(cfg.openRouterBase, cfg.timeouts.llmMs)
const multiReview = new MultiModelReviewUseCase(textLlm, timeline)
app.post(`${BASE_PATH}/modes/structured/review`, express.json(), makeStructuredReviewHandler(multiReview))

const finalAgg = new FinalAggregationUseCase(textLlm, timeline)
const ag = makeAggregateRouter({ usecase: finalAgg, storageRoot: cfg.storageRoot })
app.post(`${BASE_PATH}/modes/structured/aggregate`, ag.upload.any(), ag.handler)

const orch = makeOrchestrateRouter({ storageRoot: cfg.storageRoot, direct: directReview, structured, multi: multiReview, aggregate: finalAgg })
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


