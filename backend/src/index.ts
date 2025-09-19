import express from 'express'
// 使用 require 导入 multer 以避免 TypeScript 在没有安装类型声明时报错
const multer = require('multer')
import path from 'path'
import fs from 'fs'
import { extractCircuitJsonFromImages } from './vision'
import { generateMarkdownReview } from './llm'
import { deepseekTextDialog } from './deepseek'
import { logInfo, logError, readRecentLines } from './logger'
import { ensureSessionsDir, saveSession, listSessions, loadSession, deleteSession, SessionFileV1, sanitizeId } from './sessions'

const app = express()
const port = Number(process.env.PORT || 3001)

const upload = multer({ dest: path.join(__dirname, '..', 'uploads') })

// 中文注释：为会话保存提供较大的 JSON 解析上限（不保存敏感信息）
app.use(express.json({ limit: '200mb' }))

// 中文注释：服务启动时确保会话目录存在
ensureSessionsDir()

// 简单 healthcheck
app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from backend' })
})

// 返回系统提示词文件内容（用于前端每次提交前加载最新提示）
app.get('/api/system-prompt', (req, res) => {
  try {
    const p = path.resolve(__dirname, '..', '..', '系统提示词.md')
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'system prompt file not found' })
    const txt = fs.readFileSync(p, { encoding: 'utf8' })
    res.type('text/plain').send(txt)
  } catch (e: any) {
    logError('read system prompt failed', { error: String(e) })
    res.status(500).json({ error: 'failed to read system prompt' })
  }
})

// POST /api/review
// 接收前端上传的图片（任意数量）和表单参数，使用 multer 处理文件
// 流程：1) 验证 model 字段 2) 若有图片，调用 vision.extractCircuitJsonFromImages 3) 调用 llm.generateMarkdownReview 4) 返回 { markdown }
app.post('/api/review', upload.any(), async (req, res) => {
  try {
    const body = req.body || {}
    const model = body.model || null
    // Accept either individual fields or a combined systemPrompts JSON
    let requirements = body.requirements || ''
    let specs = body.specs || ''
    // reviewGuidelines 已移除，保留兼容性：若前端仍发送则会被忽略
    let reviewGuidelines = ''
    let systemPrompt = ''
    if (body.systemPrompts) {
      try {
        const sp = typeof body.systemPrompts === 'string' ? JSON.parse(body.systemPrompts) : body.systemPrompts
        if (sp) {
          systemPrompt = sp.systemPrompt || ''
          requirements = (systemPrompt ? systemPrompt + '\n\n' : '') + (sp.requirements || requirements)
          specs = (sp.specs || specs)
          // 注意：已弃用 reviewGuidelines 字段，保持兼容性但不使用
        }
      } catch (e) {
        // ignore parse errors
      }
    }

    if (!model) {
      return res.status(400).json({ error: 'model missing: please specify model (gpt-5)' })
    }

    // 透传 Authorization 头（但不记录）
    const authHeader = req.header('authorization') || undefined
    // accept history if provided
    let history: any[] = []
    if (body.history) {
      try {
        history = typeof body.history === 'string' ? JSON.parse(body.history) : body.history
      } catch (e) {
        history = []
      }
    }
    // 先收集 multer 保存的文件信息（只保留 image/*），以便 provider 分支使用
    const maybeFiles = (req as any).files
    const files = Array.isArray(maybeFiles) ? maybeFiles.filter((f: any) => f.mimetype && f.mimetype.startsWith('image/')) : []
    // provider 优先使用前端传入；若未传则基于 apiUrl 或 model 名称做简单推断（支持 deepseek 自动识别）
    let provider = body.provider
    if (!provider) {
      const apiUrlLower = (body.apiUrl || '').toString().toLowerCase()
      const modelLower = (body.model || '').toString().toLowerCase()
      if (apiUrlLower.includes('deepseek') || modelLower.includes('deepseek')) {
        provider = 'deepseek'
      } else {
        provider = 'gpt5'
      }
    }
    logInfo('api/review provider', { provider })
    const apiUrl = body.apiUrl || null

    // provider 路由选择：支持 'deepseek' (文本对话) 与 'gpt5'（图像识别 + 评审）
    if (provider === 'deepseek') {
      if (!apiUrl) return res.status(400).json({ error: 'apiUrl missing: please specify API URL for deepseek' })
      if (files.length > 0) return res.status(400).json({ error: 'deepseek provider does not support images; use gpt5 provider' })
      const message = `Please review the following design requirements and return a Markdown review.\n\nDesign requirements:\n${requirements}\n\nDesign specs:\n${specs}`
      // 如果用户提供的是 base URL（例如 https://api.deepseek.com/v1），deepseekTextDialog 会尝试直接调用该 URL；
      // 我们希望记录尝试的 origin 以便排查，但不要记录敏感头部。
      logInfo('api/review forwarding to deepseek', { apiHost: (() => { try { return new URL(apiUrl).origin } catch(e){return apiUrl} })() })
      const reply = await deepseekTextDialog(apiUrl, message, model, authHeader, systemPrompt, history)
      return res.json({ markdown: reply })
    }

    // 简单日志（不包含敏感信息）
    logInfo('api/review received', { imageCount: files.length, model })

    if (!apiUrl) return res.status(400).json({ error: 'apiUrl missing: please specify API URL for gpt5' })

    let circuitJson: any = { components: [], connections: [] }
    // 支持前端在后续提交时直接传回 enrichedJson（避免二次上传图片并复用已生成的描述）
    if (body.enrichedJson) {
      try {
        circuitJson = typeof body.enrichedJson === 'string' ? JSON.parse(body.enrichedJson) : body.enrichedJson
      } catch (e) {
        circuitJson = body.enrichedJson
      }
    }

    // 调用 LLM，已移除 reviewGuidelines 参数
    // 记录后端各阶段时间戳以便前端展示详细的会话进度与耗时
    const timeline: { step: string; ts: number }[] = []
    timeline.push({ step: 'request_received', ts: Date.now() })

    // 如果需要识别图片，标记并记录阶段时间点；在此处创建必要的局部变量以避免作用域问题
    if (!body.enrichedJson && files.length > 0) {
      timeline.push({ step: 'images_processing_start', ts: Date.now() })
      const imgs = files.map((f: any) => ({ path: f.path, originalname: f.originalname }))
      const enableSearch = body.enableSearch === undefined ? true : (body.enableSearch === 'false' ? false : Boolean(body.enableSearch))
      const topN = body.searchTopN ? Number(body.searchTopN) : undefined
      const saveEnriched = body.saveEnriched === undefined ? true : (body.saveEnriched === 'false' ? false : Boolean(body.saveEnriched))
      circuitJson = await extractCircuitJsonFromImages(imgs, apiUrl, model, authHeader, { enableSearch, topN, saveEnriched })
      timeline.push({ step: 'images_processing_done', ts: Date.now() })
    }

    timeline.push({ step: 'llm_request_start', ts: Date.now() })
    const markdown = await generateMarkdownReview(circuitJson, requirements, specs, apiUrl, model, authHeader, systemPrompt, history)
    timeline.push({ step: 'llm_request_done', ts: Date.now() })

    // 返回结果（包含 enrichedJson 与 overlay/metadata）
    // 如果 circuitJson 包含 overlay/metadata，则直接返回；否则仅返回 markdown 与 enrichedJson
    const responseBody: any = { markdown }
    // 将 timeline 作为非敏感的元数据随响应返回，便于前端计算每一步耗时（仅包含时间戳和步骤标识）
    try { responseBody.timeline = timeline } catch (e) {}
    responseBody.enrichedJson = circuitJson
    if ((circuitJson as any).overlay) responseBody.overlay = (circuitJson as any).overlay
    if ((circuitJson as any).metadata) responseBody.metadata = (circuitJson as any).metadata

    // 在发送响应前记录 response_sent，以便排查客户端与服务端时间线
    try {
      logInfo('api/review response_sent', { hasOverlay: !!responseBody.overlay, hasMetadata: !!responseBody.metadata, imageCount: files.length })
    } catch (e) { /* ignore logging errors */ }

    // 若存在需要人工确认的 low confidence 或冲突，返回 422 并在 body 中包含相关信息（但仍返回 JSON）
    const lowConflicts = (circuitJson && circuitJson.nets && circuitJson.nets.some((n:any)=>n.confidence !== undefined && n.confidence < 0.9)) || false
    if (lowConflicts) {
      res.status(422).json(Object.assign(responseBody, { warnings: ['low_confidence_or_conflict'] }))
    } else {
      res.json(responseBody)
    }
  } catch (err: any) {
    logError('api/review error', { error: String(err?.message || err) })
    const msg = err?.message ? `Upstream error: ${err.message}` : 'Internal server error'
    res.status(502).json({ error: msg })
  } finally {
    // 可选：清理 multer 临时文件（谨慎，确保不会删除正在使用的文件）
    try {
      const maybeFiles = (req as any).files
      const files = Array.isArray(maybeFiles) ? maybeFiles : []
      files.forEach((f: any) => {
        if (f && f.path && fs.existsSync(f.path)) {
          fs.unlink(f.path, () => {})
        }
      })
    } catch (e) {
      // 忽略清理错误
    }
  }
})

// 中文注释：保存会话（不保存敏感信息，如 Authorization 或 API Key）
app.post('/api/sessions/save', (req, res) => {
  try {
    const body = req.body as SessionFileV1
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'invalid body' })
    // 基础校验
    if (!body.apiUrl || !body.model) return res.status(400).json({ error: 'apiUrl and model are required' })
    // 明确删除不应存在的敏感字段
    // @ts-ignore
    if ((body as any).apiKey) delete (body as any).apiKey
    // @ts-ignore
    if ((body as any).authorization) delete (body as any).authorization
    const meta = saveSession({
      version: 1,
      apiUrl: String(body.apiUrl),
      model: String(body.model),
      customModelName: body.customModelName ? String(body.customModelName) : undefined,
      requirements: String(body.requirements || ''),
      specs: String(body.specs || ''),
      questionConfirm: String(body.questionConfirm || ''),
      dialog: String(body.dialog || ''),
      history: Array.isArray(body.history) ? body.history : [],
      markdown: String(body.markdown || ''),
      enrichedJson: body.enrichedJson,
      overlay: body.overlay,
      files: Array.isArray(body.files) ? body.files : [],
    })
    res.json({ ok: true, id: meta.id, filename: meta.filename, createdAt: meta.createdAt })
  } catch (e: any) {
    logError('/api/sessions/save error', { error: String(e?.message || e) })
    res.status(500).json({ error: 'failed to save session' })
  }
})

// 中文注释：列出最近会话，默认 10 条
app.get('/api/sessions/list', (req, res) => {
  try {
    const limitRaw = (req.query.limit as string) || '10'
    const limit = Math.max(1, Math.min(100, Number(limitRaw) || 10))
    const items = listSessions(limit)
    res.json({ items })
  } catch (e: any) {
    logError('/api/sessions/list error', { error: String(e?.message || e) })
    res.status(500).json({ error: 'failed to list sessions' })
  }
})

// 中文注释：获取单个会话完整内容
app.get('/api/sessions/:id', (req, res) => {
  try {
    const id = sanitizeId(String(req.params.id || ''))
    if (!id) return res.status(400).json({ error: 'invalid id' })
    const data = loadSession(id)
    res.json(data)
  } catch (e: any) {
    if (/not found/i.test(String(e?.message))) return res.status(404).json({ error: 'not found' })
    logError('/api/sessions/:id error', { error: String(e?.message || e) })
    res.status(500).json({ error: 'failed to read session' })
  }
})

// 中文注释：删除会话
app.delete('/api/sessions/:id', (req, res) => {
  try {
    const id = sanitizeId(String(req.params.id || ''))
    if (!id) return res.status(400).json({ error: 'invalid id' })
    deleteSession(id)
    res.json({ ok: true })
  } catch (e: any) {
    logError('DELETE /api/sessions/:id error', { error: String(e?.message || e) })
    res.status(500).json({ error: 'failed to delete session' })
  }
})

// Deepseek 简单文本对话测试端点
app.post('/api/deepseek', express.json(), async (req, res) => {
  try {
    const body = req.body || {}
    const apiUrl = body.apiUrl
    const message = body.message || ''
    const authHeader = req.header('authorization') || undefined
    if (!apiUrl) return res.status(400).json({ error: 'apiUrl required' })
    const reply = await deepseekTextDialog(apiUrl, message, authHeader)
    res.json({ reply })
  } catch (err: any) {
    logError('/api/deepseek error', { error: String(err?.message || err) })
    res.status(502).json({ error: err?.message || 'upstream error' })
  }
})

// 提供日志读取端点（本地调试用）
app.get('/api/logs', (req, res) => {
  try {
    const lines = readRecentLines(500)
    res.json({ lines })
  } catch (e) {
    logError('read logs failed', { error: String(e) })
    res.status(500).json({ error: 'failed to read logs' })
  }
})

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`)
})


