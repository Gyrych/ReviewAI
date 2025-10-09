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
import { OpenRouterSearch } from '../infra/search'
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

// 中文注释：加载环境变量（注意：不要将密钥写入日志或工件）
dotenv.config()

// 中文注释：基础配置（端口与前缀）
const cfg = loadConfig()
const PORT = cfg.port
const BASE_PATH = cfg.basePath

// 中文注释：创建 Express 应用，并挂载健康检查路由
const app = express()

// 中文注释：启用严格来源白名单的 CORS，允许前端开发站点访问，并放行 Authorization/Content-Type 头
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

// 统一 JSON 解析与基础错误处理中间件
app.use(express.json({ limit: '200mb' }))
app.use((req, res, next) => {
  try { next() } catch (e: any) { res.status(500).json({ error: 'internal error' }) }
})

// 健康检查（最小可运行入口）
app.get(`${BASE_PATH}/health`, healthHandler)

// 中文注释：静态 artifacts、logo、system-prompt 挂载（隔离存储根）
try {
  const storageRoot = cfg.storageRoot
  const artifactsDir = path.join(storageRoot, 'artifacts')
  app.use(`${BASE_PATH}/artifacts`, express.static(artifactsDir))
  // logo（直接使用仓库根 logo 目录）
  const repoRootForStatic = path.resolve(__dirname, '..', '..', '..', '..')
  const repoLogoDir = path.resolve(repoRootForStatic, 'logo')
  app.use(`${BASE_PATH}/logo`, express.static(repoLogoDir))
  // system prompts（复用 ReviewAIPrompt 或仓库根）
  // 注意：此路由放在 try 块之外，避免静态资源挂载异常导致路由未注册
} catch {}

// 中文注释：进度查询端点（默认使用内存实现；后续可切换为 Redis 实例）
// 中文注释：优先使用 Redis（若可用），否则回退内存
let progressStore: any = new ProgressMemoryStore()
;(async () => {
  try {
    const redisMod: any = await import('redis')
    const createClient = redisMod.createClient
    const client = createClient({ url: cfg.redisUrl })
    await client.connect()
    progressStore = new ProgressRedisStore(client, { ttlSeconds: 24 * 60 * 60 })
    console.log('[circuit-agent] Progress store: Redis')
  } catch (e: any) {
    // 保持 Memory fallback，记录原因但不抛出
    console.log('[circuit-agent] Progress store: Memory (fallback)', e?.message || '')
  }
})()

app.get(`${BASE_PATH}/progress/:id`, makeProgressHandler(progressStore))

// 中文注释：system-prompt 路由（独立注册，避免前置 try/catch 影响）
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

// 中文注释：挂载直接评审模式路由（multipart 上传）
const artifact = new ArtifactStoreFs(cfg.storageRoot)
const timeline = new TimelineService(progressStore)
const vision = new OpenRouterVisionChat(cfg.openRouterBase, cfg.timeouts.llmMs)
// 将 OpenRouterSearch 注入到 DirectReviewUseCase 以支持 enableSearch 标志
const searchProvider = new OpenRouterSearch(cfg.openRouterBase, cfg.timeouts.llmMs)
const directReview = new DirectReviewUseCase(vision, artifact, timeline, searchProvider)
const { upload, handler } = makeDirectReviewRouter({ usecase: directReview, artifact, storageRoot: cfg.storageRoot })
app.post(`${BASE_PATH}/modes/direct/review`, upload.any(), handler)

// 中文注释：挂载精细评审模式——固定5轮识别 + 可选 datasheet 搜索（使用 OpenRouterSearch）
const search = new OpenRouterSearch(cfg.openRouterBase, cfg.timeouts.llmMs)
const visionProvider = new OpenRouterVisionProvider(cfg.openRouterBase, cfg.timeouts.visionMs)
const structured = new StructuredRecognitionUseCase(visionProvider, search, timeline)
const sr = makeStructuredRecognizeRouter({ usecase: structured, storageRoot: cfg.storageRoot })
app.post(`${BASE_PATH}/modes/structured/recognize`, sr.upload.any(), sr.handler)

// 中文注释：并行文本评审 + 最终整合
const textLlm = new OpenRouterTextProvider(cfg.openRouterBase, cfg.timeouts.llmMs)
const multiReview = new MultiModelReviewUseCase(textLlm, timeline)
app.post(`${BASE_PATH}/modes/structured/review`, express.json(), makeStructuredReviewHandler(multiReview))

const finalAgg = new FinalAggregationUseCase(textLlm, timeline)
const ag = makeAggregateRouter({ usecase: finalAgg, storageRoot: cfg.storageRoot })
app.post(`${BASE_PATH}/modes/structured/aggregate`, ag.upload.any(), ag.handler)

// 中文注释：统一编排入口（便于前端仅调用一个端点）
const orch = makeOrchestrateRouter({ storageRoot: cfg.storageRoot, direct: directReview, structured, multi: multiReview, aggregate: finalAgg })
app.post(`${BASE_PATH}/orchestrate/review`, orch.upload.any(), orch.handler)

function fsExists(p: string): boolean { try { return fs.existsSync(p) } catch { return false } }

// 中文注释：sessions 路由（list/load/save/delete）
const sessions = new SessionStoreFs(cfg.storageRoot)
const sess = makeSessionsHandlers(sessions)
app.post(`${BASE_PATH}/sessions/save`, express.json(), sess.save)
app.get(`${BASE_PATH}/sessions/list`, sess.list)
app.get(`${BASE_PATH}/sessions/:id`, sess.read)
app.delete(`${BASE_PATH}/sessions/:id`, sess.remove)

// 中文注释：启动服务
app.listen(PORT, () => {
  console.log(`[circuit-agent] listening on http://localhost:${PORT}${BASE_PATH}/health`)
})


