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
import { initProgress, pushProgress, getProgress, clearProgress } from './progress'
import { artifactsDir, computeSha1, saveArtifact } from './artifacts'
import { makeTimelineItem, makeRequestSignature } from './timeline'

const app = express()
const port = Number(process.env.PORT || 3001)

const upload = multer({ dest: path.join(__dirname, '..', 'uploads') })

// 中文注释：为会话保存提供较大的 JSON 解析上限（不保存敏感信息）
app.use(express.json({ limit: '200mb' }))

// 中文注释：服务启动时确保会话目录存在
ensureSessionsDir()

// 简单 healthcheck
app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

// 提供项目根目录下 logo 静态文件（用于前端通过 /api 路径获取 logo）
// 这样在开发模式下，前端可通过代理将请求转发到后端（例如 /api/logo/logo.png）以获取仓库根目录的图片文件
app.use('/api/logo', express.static(path.resolve(__dirname, '..', '..', 'logo')))

// 提供 artifacts 静态文件访问
try {
  const dir = artifactsDir()
  app.use('/api/artifacts', express.static(dir))
} catch (e) {
  logError('artifacts.static.mount.failed', { error: String(e) })
}

// 提供 datasheets 静态文件访问（便于直接打开已下载的 PDF/HTML）
try {
  const dsDir = path.resolve(__dirname, '..', 'uploads', 'datasheets')
  if (fs.existsSync(dsDir)) {
    app.use('/api/datasheets', express.static(dsDir))
  }
} catch (e) {
  logError('datasheets.static.mount.failed', { error: String(e) })
}

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from backend' })
})

// 返回系统提示词文件内容（用于前端每次提交前加载最新提示）
app.get('/api/system-prompt', (req, res) => {
  try {
    const qLangRaw = (req.query.lang as string) || ''
    const qLang = (qLangRaw === 'en' || qLangRaw === 'zh') ? qLangRaw : 'zh'
    const filename = qLang === 'en' ? 'SystemPrompt.md' : '系统提示词.md'
    // 优先从 ReviewAIPrompt 目录读取（首选），若不存在则回退到仓库根目录
    const preferredDir = path.resolve(__dirname, '..', '..', 'ReviewAIPrompt')
    const preferredPath = path.join(preferredDir, filename)
    const fallbackPath = path.resolve(__dirname, '..', '..', filename)
    let p = preferredPath
    if (!fs.existsSync(p)) {
      if (fs.existsSync(fallbackPath)) {
        p = fallbackPath
      } else {
        return res.status(404).json({ error: 'system prompt file not found', lang: qLang })
      }
    }
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
          // 中文注释：系统提示词仅作为 system role 注入，不再重复拼接到 requirements，避免语言与内容重复
          requirements = (sp.requirements || requirements)
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
  // 中文注释：接受图片与 PDF（原理图 PDF）
  const files = Array.isArray(maybeFiles)
    ? maybeFiles.filter((f: any) => {
        const mt = f.mimetype || ''
        return (typeof mt === 'string') && (mt.startsWith('image/') || mt === 'application/pdf')
      })
    : []
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
    // 为 deepseek 分支创建独立的 timeline 与 progressId，避免变量提升错误
    if (provider === 'deepseek') {
      const progressId = (body.progressId || '').toString().trim()
      if (progressId) { try { initProgress(progressId) } catch {} }
      const timeline: { step: string; ts: number; meta?: any }[] = []
      if (!apiUrl) return res.status(400).json({ error: 'apiUrl missing: please specify API URL for deepseek' })
      if (files.length > 0) return res.status(400).json({ error: 'deepseek provider does not support images; use gpt5 provider' })
      const message = `Please review the following design requirements and return a Markdown review.\n\nDesign requirements:\n${requirements}\n\nDesign specs:\n${specs}`
      // 如果用户提供的是 base URL（例如 https://api.deepseek.com/v1），deepseekTextDialog 会尝试直接调用该 URL；
      // 我们希望记录尝试的 origin 以便排查，但不要记录敏感头部。
      logInfo('api/review forwarding to deepseek', { apiHost: (() => { try { return new URL(apiUrl).origin } catch(e){return apiUrl} })() })

      // 实时进度：记录二次分析开始
      timeline.push({ step: 'second_stage_analysis_start', ts: Date.now() })
      if (progressId) pushProgress(progressId, { step: 'second_stage_analysis_start', ts: Date.now() })

      // 保存 LLM 请求 artifact（不含敏感头）
      let requestArtifact: any = null
      try {
        const { saveArtifact } = require('./artifacts')
        const payloadPreview = {
          provider: 'deepseek',
          apiHost: (() => { try { return new URL(apiUrl).origin } catch(e){return apiUrl} })(),
          model,
          systemPrompt: systemPrompt || '',
          message,
          history: Array.isArray(history) ? history : []
        }
        requestArtifact = await saveArtifact(JSON.stringify(payloadPreview, null, 2), `llm_request_deepseek_${Date.now()}`, { ext: '.json', contentType: 'application/json' })
      } catch {}

      const reply = await deepseekTextDialog(apiUrl, message, model, authHeader, systemPrompt, history)

      // 保存 LLM 响应 artifact
      let responseArtifact: any = null
      try {
        const { saveArtifact } = require('./artifacts')
        responseArtifact = await saveArtifact(String(reply || ''), `llm_response_deepseek_${Date.now()}`, { ext: '.md', contentType: 'text/markdown' })
      } catch {}

      // 记录分析完成
      timeline.push({ step: 'second_stage_analysis_done', ts: Date.now() })
      if (progressId) pushProgress(progressId, { step: 'second_stage_analysis_done', ts: Date.now() })

      // 增加结果节点，携带 llmResponse 与 artifacts
      const resultItem = {
        step: 'analysis_result',
        ts: Date.now(),
        meta: {
          llmResponse: { fullResponse: String(reply || '') },
          requestArtifact,
          responseArtifact
        }
      }
      timeline.push(resultItem)
      if (progressId) pushProgress(progressId, resultItem as any)

      return res.json({ markdown: reply, timeline })
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

  // 实时进度：若存在 progressId，将 timeline 每步同步到内存 store，供前端轮询实时查看
  const progressId = (body.progressId || '').toString().trim()
  if (progressId) { try { initProgress(progressId) } catch {} }

  // 调用 LLM，已移除 reviewGuidelines 参数
  // 记录后端各阶段时间戳以便前端展示详细的会话进度与耗时
  const timeline: { step: string; ts: number; meta?: any }[] = []
  const tReq = Date.now()
  const reqReceived = makeTimelineItem('backend.request_received', { ts: tReq, origin: 'backend', category: 'state', meta: { description: '请求已接收' } })
  timeline.push(reqReceived)
  if (progressId) pushProgress(progressId, reqReceived)

  // 记录请求快照（脱敏）到 artifact，并推送 request_payload_received
  try {
    const filesPreview = files.map((f: any) => ({ name: f.originalname, mimetype: f.mimetype, size: f.size }))
    const snapshot = {
      provider,
      apiUrlOrigin: (() => { try { return new URL(apiUrl).origin } catch(e){ return apiUrl } })(),
      model,
      options: {
        enableSearch: body.enableSearch,
        searchTopN: body.searchTopN,
        saveEnriched: body.saveEnriched,
        multiPassRecognition: body.multiPassRecognition,
        recognitionPasses: body.recognitionPasses
      },
      files: filesPreview,
      enrichedJsonProvided: !!body.enrichedJson
    }
    const a = await saveArtifact(JSON.stringify(snapshot, null, 2), `request_snapshot_${Date.now()}`, { ext: '.json', contentType: 'application/json' })
    const it = makeTimelineItem('backend.request_payload_received', { ts: Date.now(), origin: 'backend', category: 'io', meta: { description: '请求载荷已接收并保存快照' }, artifacts: { request: a } })
    timeline.push(it)
    if (progressId) pushProgress(progressId, it)
  } catch {}

  // 初始化IC器件资料元数据
  let datasheetMeta: any[] = []

  // 如果前端请求 directReview，则跳过视觉解析流程，直接将图片/资料与提示一并转发给大模型进行评审
  const directReview = (String(body.directReview || '').toLowerCase() === 'true')
  if (directReview) {
    const tImgStart = Date.now()
    const imgStart = makeTimelineItem('vision.processing_skipped', { ts: tImgStart, origin: 'backend', category: 'vision', meta: { modelType: 'vision', description: 'Direct review requested - skip vision parsing' } })
    timeline.push(imgStart)
    if (progressId) pushProgress(progressId, imgStart)

    // 保存上传的图片 artifact 以便审计和作为 LLM 请求的附件参考
    try {
      const { saveArtifactFromPath, saveArtifact } = require('./artifacts')
      const savedFiles: any[] = []
      for (const f of files) {
        try {
          const a = await saveArtifactFromPath(f.path, `uploaded_${f.originalname}`)
          savedFiles.push(a)
        } catch (e) {
          // 忽略单个文件保存失败
        }
      }
      // 将 files metadata 写入 timeline
      const it = makeTimelineItem('backend.saved_uploads', { ts: Date.now(), origin: 'backend', category: 'io', meta: { description: 'Uploaded files saved for direct review', files: savedFiles } })
      timeline.push(it)
      if (progressId) pushProgress(progressId, it)
    } catch (e) {
      // 忽略 artifact 保存错误
    }

    // 直接构造供 LLM 使用的 message：包含用户提供的 requirements/specs/systemPrompt/history/dialog
    const llmSystem = systemPrompt || ''
    const userMessage = `Please review the attached schematic images and any provided datasheets.\n\nDesign requirements:\n${requirements}\n\nDesign specs:\n${specs}\n\nIf you need clarification, return clarifying questions first; otherwise produce a Markdown review.`

    // 保存 LLM 请求 artifact
    try {
      const { saveArtifact } = require('./artifacts')
      const preview = { model, apiUrl, systemPrompt: llmSystem, message: userMessage, filesCount: files.length }
      await saveArtifact(JSON.stringify(preview, null, 2), `direct_review_request_${Date.now()}`, { ext: '.json', contentType: 'application/json' })
    } catch {}

    // 调用大模型进行直接评审（使用 generateMarkdownReview，以 circuitJson 为空表示无结构化JSON）
    const markdown = await generateMarkdownReview({ components: [], connections: [] }, requirements, specs, apiUrl, model, authHeader, systemPrompt, history, [], timeline, progressId)
    const llmDone = makeTimelineItem('llm.analysis_done', { ts: Date.now(), origin: 'backend', category: 'llm', meta: { modelType: 'llm', description: 'Direct LLM analysis complete' } })
    timeline.push(llmDone)
    if (progressId) pushProgress(progressId, llmDone)

    // 保存评审报告 artifact
    try {
      const { saveArtifact } = require('./artifacts')
      const reportA = await saveArtifact(String(markdown || ''), `review_report_${Date.now()}`, { ext: '.md', contentType: 'text/markdown' })
      const it = makeTimelineItem('analysis.result', { ts: Date.now(), origin: 'backend', category: 'llm', meta: { description: 'Analysis result (direct review)', artifacts: { result: reportA } } })
      timeline.push(it)
      if (progressId) pushProgress(progressId, it)
    } catch {}

    const responseBody: any = { markdown }
    try { responseBody.timeline = timeline } catch {}
    try { responseBody.enrichedJson = { components: [], connections: [] } } catch {}
    return res.json(responseBody)
  }

  // 如果需要识别图片，标记并记录阶段时间点；在此处创建必要的局部变量以避免作用域问题
  if (!body.enrichedJson && files.length > 0) {
    const tImgStart = Date.now()
    const imgStart = makeTimelineItem('vision.processing_start', { ts: tImgStart, origin: 'backend', category: 'vision', meta: { modelType: 'vision', description: '开始进行视觉识别与解析' } })
    timeline.push(imgStart)
    if (progressId) pushProgress(progressId, imgStart)
      // 记录批处理视觉请求（脱敏）
      try {
        const filesPreview2 = files.map((f: any) => {
          const info = { name: f.originalname, mimetype: f.mimetype, size: f.size }
          try { const buf = fs.existsSync(f.path) ? fs.readFileSync(f.path) : null; if (buf) (info as any).sha1 = computeSha1(buf) } catch {}
          return info
        })
        const visionReq = { apiUrlOrigin: (() => { try { return new URL(apiUrl).origin } catch(e){return apiUrl} })(), model, files: filesPreview2 }
        const a = await saveArtifact(JSON.stringify(visionReq, null, 2), `vision_batch_request_${Date.now()}`, { ext: '.json', contentType: 'application/json' })
        const it = makeTimelineItem('vision.request', { ts: Date.now(), origin: 'backend', category: 'vision', meta: { description: '视觉批处理请求已生成', modelType: 'vision' }, artifacts: { request: a } })
        timeline.push(it)
        if (progressId) pushProgress(progressId, it)
      } catch {}
      const imgs = files.map((f: any) => ({ path: f.path, originalname: f.originalname }))
      // 统一解析布尔/选项字段，记录原始值以便诊断前端传参问题
      function parseBooleanField(value: any, defaultVal: boolean): boolean {
        if (value === undefined) return defaultVal
        if (typeof value === 'boolean') return value
        const s = String(value).trim().toLowerCase()
        if (s === 'false' || s === '0' || s === 'no') return false
        if (s === 'true' || s === '1' || s === 'yes') return true
        // 无法识别时返回默认值并记录警告
        logError('vision.options.parse_warning', { fieldValue: value, defaultVal })
        return defaultVal
      }

      const enableSearch = parseBooleanField(body.enableSearch, true)
      const topN = body.searchTopN ? Number(body.searchTopN) : undefined
      const saveEnriched = parseBooleanField(body.saveEnriched, true)
      const multiPassRecognition = body.multiPassRecognition === 'true' ? true : false
      const recognitionPasses = body.recognitionPasses ? Number(body.recognitionPasses) : 5
      // 记录解析到的选项，便于诊断（包含是否启用多轮识别与轮数）
      logInfo('vision.options.parsed', {
        enableSearch,
        topN,
        saveEnriched,
        multiPassRecognition,
        recognitionPasses
      })
      circuitJson = await extractCircuitJsonFromImages(
        imgs,
        apiUrl,
        model,
        authHeader,
        { enableSearch, topN, saveEnriched, multiPassRecognition, recognitionPasses, progressId },
        timeline
      )

      // 记录图片解析结果摘要到 timeline
      const processingMeta: any = {
        componentsCount: Array.isArray(circuitJson?.components) ? circuitJson.components.length : 0,
        connectionsCount: Array.isArray(circuitJson?.connections) ? circuitJson.connections.length : 0,
        netsCount: Array.isArray(circuitJson?.nets) ? circuitJson.nets.length : 0,
        hasOverlay: !!(circuitJson as any)?.overlay,
        hasMetadata: !!(circuitJson as any)?.metadata,
        enrichedComponentsCount: Array.isArray(circuitJson?.components) ? circuitJson.components.filter((c: any) => c.enrichment).length : 0
      }
      const imgDone = {
        step: 'images_processing_done',
        ts: Date.now(),
        meta: {
          type: 'vision_result',
          modelType: 'vision',
          visionResult: processingMeta,
          description: `视觉识别解析完成，识别出 ${processingMeta.componentsCount} 个器件，${processingMeta.connectionsCount} 条连接` ,
          summary: `识别出 ${processingMeta.componentsCount} 个器件，${processingMeta.connectionsCount} 条连接，${processingMeta.netsCount} 个网络${processingMeta.hasOverlay ? '，包含可视化覆盖层' : ''}${processingMeta.enrichedComponentsCount > 0 ? `，${processingMeta.enrichedComponentsCount} 个器件有参数补充` : ''}`
        }
      }
      timeline.push(imgDone)
      if (progressId) pushProgress(progressId, imgDone)

      // 将最终结构化描述与可选 overlay/metadata 作为 artifacts 引用到时间线
      try {
        const finalA = await saveArtifact(JSON.stringify(circuitJson, null, 2), `final_circuit_${Date.now()}`, { ext: '.json', contentType: 'application/json' })
        ;(imgDone.meta as any).finalCircuitArtifact = finalA
      } catch {}
      try {
        if ((circuitJson as any)?.overlay) {
          const overlayA = await saveArtifact(JSON.stringify((circuitJson as any).overlay, null, 2), `overlay_${Date.now()}`, { ext: '.json', contentType: 'application/json' })
          ;(imgDone.meta as any).overlayArtifact = overlayA
        }
      } catch {}
      try {
        if ((circuitJson as any)?.metadata) {
          const metadataA = await saveArtifact(JSON.stringify((circuitJson as any).metadata, null, 2), `metadata_${Date.now()}`, { ext: '.json', contentType: 'application/json' })
          ;(imgDone.meta as any).metadataArtifact = metadataA
        }
      } catch {}

      // 视觉阶段内部已完成 datasheets 下载与元数据落盘，此处补记时间线
      const datasheetCount = (circuitJson as any)?.datasheetMeta?.length || 0
      const downloadedCount = (circuitJson as any)?.datasheetMeta?.filter((item: any) => item.notes && item.notes.includes('saved:'))?.length || 0
      const dsDone = makeTimelineItem('backend.datasheets_fetch_done', { ts: Date.now(), origin: 'backend', category: 'io', meta: { datasheetCount, downloadedCount, datasheets: (circuitJson as any)?.datasheetMeta || [], description: '器件资料下载完成' } })
      timeline.push(dsDone)
      if (progressId) pushProgress(progressId, dsDone)
      // 将 datasheets 集中元数据复制为 artifact，并生成每个文件的可访问 URL
      try {
        const items = (circuitJson as any)?.datasheetMeta || []
        const normalized = items.map((it: any) => {
          const p = (it && typeof it.notes === 'string' && it.notes.startsWith('saved: ')) ? it.notes.slice(7) : ''
          const url = p ? `/api/datasheets/${path.basename(p)}` : (it.source_url || '')
          return Object.assign({}, it, { fileUrl: url })
        })
        const a = await saveArtifact(JSON.stringify({ items: normalized }, null, 2), `datasheets_metadata_${Date.now()}`, { ext: '.json', contentType: 'application/json' })
        ;(dsDone.meta as any).datasheetsMetadataArtifact = a
      } catch {}
    } else {
    const skipped = makeTimelineItem('vision.processing_skipped', { ts: Date.now(), origin: 'backend', category: 'vision', meta: { description: '图片处理被跳过' } })
    timeline.push(skipped)
    if (progressId) pushProgress(progressId, skipped)
    }

  const tLlmStart = Date.now()
  const llmStart = makeTimelineItem('llm.analysis_start', { ts: tLlmStart, origin: 'backend', category: 'llm', meta: { modelType: 'llm', description: '开始二次分析（调用大语言模型）' } })
  timeline.push(llmStart)
  if (progressId) pushProgress(progressId, llmStart)
  const markdown = await generateMarkdownReview(circuitJson, requirements, specs, apiUrl, model, authHeader, systemPrompt, history, datasheetMeta, timeline, progressId)
    const llmDone = makeTimelineItem('llm.analysis_done', { ts: Date.now(), origin: 'backend', category: 'llm', meta: { modelType: 'llm', description: '二次分析完成' } })
    timeline.push(llmDone)
    if (progressId) pushProgress(progressId, llmDone)

  // 将评审报告落盘并在 analysis_result 中引用
  try {
    const reportA = await saveArtifact(String(markdown || ''), `review_report_${Date.now()}`, { ext: '.md', contentType: 'text/markdown' })
    const it = makeTimelineItem('analysis.result', { ts: Date.now(), origin: 'backend', category: 'llm', meta: { description: '分析结果已生成' }, artifacts: { result: reportA } })
    timeline.push(it)
    if (progressId) pushProgress(progressId, it)
  } catch {}

    // 返回结果（包含 enrichedJson 与 overlay/metadata）
    // 如果 circuitJson 包含 overlay/metadata，则直接返回；否则仅返回 markdown 与 enrichedJson
    const responseBody: any = { markdown }
    // 将 timeline 作为非敏感的元数据随响应返回（包含 artifact 引用），便于前端计算每一步耗时与查看完整请求/响应
    try { responseBody.timeline = timeline } catch (e) {}
    responseBody.enrichedJson = circuitJson
    if ((circuitJson as any).overlay) responseBody.overlay = (circuitJson as any).overlay
    if ((circuitJson as any).metadata) responseBody.metadata = (circuitJson as any).metadata

    // 在发送响应前记录 response_sent，并输出 timeline 摘要以便排查客户端与服务端时间线
    try {
      logInfo('api/review response_sent', { hasOverlay: !!responseBody.overlay, hasMetadata: !!responseBody.metadata, imageCount: files.length })
    } catch (e) { /* ignore logging errors */ }
    try {
      // 打印 timeline 长度与近期条目元数据键，便于调试前端未展示问题
      if (Array.isArray(timeline)) {
        const sample = timeline.slice(-5).map((it: any) => ({ step: it.step, metaKeys: it.meta ? Object.keys(it.meta) : [] }))
        logInfo('api/review timeline.summary', { length: timeline.length, sample })
      }
    } catch (e) { /* ignore logging errors */ }

    // 若存在需要人工确认的 low confidence 或冲突，返回 422 并在 body 中包含相关信息（但仍返回 JSON）
    // 中文注释：低置信触发策略（网络 + 器件）：任一 < 0.90 则触发 422
    let lowConflicts = false
    try {
      if (Array.isArray((circuitJson as any).nets)) {
        lowConflicts = (circuitJson as any).nets.some((n: any) => typeof n?.confidence === 'number' && n.confidence < 0.9)
      }
      if (!lowConflicts && Array.isArray((circuitJson as any).components)) {
        let minPinConf = 1.0
        for (const c of (circuitJson as any).components) {
          const pins = Array.isArray(c?.pins) ? c.pins : []
          for (const p of pins) {
            if (typeof p?.confidence === 'number') {
              minPinConf = Math.min(minPinConf, p.confidence)
            }
          }
        }
        if (minPinConf < 0.9) lowConflicts = true
      }
      // 若 metadata.overall_confidence 存在，亦可作为补充判据
      if (!lowConflicts && (circuitJson as any).metadata && typeof (circuitJson as any).metadata.overall_confidence === 'number') {
        if ((circuitJson as any).metadata.overall_confidence < 0.9) lowConflicts = true
      }
    } catch {}
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

// 实时进度轮询接口（内存存储）：仅用于开发/调试
app.get('/api/progress/:id', (req, res) => {
  try {
    const id = String(req.params.id || '')
    const tl = getProgress(id)
    res.json({ timeline: tl })
  } catch (e: any) {
    res.status(500).json({ error: 'failed to read progress' })
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
      timeline: Array.isArray(body.timeline) ? body.timeline : undefined,
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

// 新增端点：POST /api/direct-review
// 独立流程：接收图片与提示词/需求/规范，先让视觉模块（或通过模型直接识别图像）生成结构化描述，再调用语言模型进行评审。
app.post('/api/direct-review', upload.any(), async (req, res) => {
  try {
    const body = req.body || {}
    const model = body.model || null
    const apiUrl = body.apiUrl || null
    const authHeader = req.header('authorization') || undefined

    if (!model) return res.status(400).json({ error: 'model missing' })
    if (!apiUrl) return res.status(400).json({ error: 'apiUrl missing' })

    const requirements = body.requirements || ''
    const specs = body.specs || ''
    const systemPrompt = (() => {
      try { const sp = body.systemPrompts ? (typeof body.systemPrompts === 'string' ? JSON.parse(body.systemPrompts) : body.systemPrompts) : null; return sp ? (sp.systemPrompt || '') : '' } catch { return '' }
    })()

    const maybeFiles = (req as any).files
    const files = Array.isArray(maybeFiles) ? maybeFiles.filter((f: any) => { const mt = f.mimetype || ''; return (typeof mt === 'string') && (mt.startsWith('image/') || mt === 'application/pdf') }) : []

    const progressId = (body.progressId || '').toString().trim()
    if (progressId) try { initProgress(progressId) } catch {}

    const timeline: { step: string; ts: number; meta?: any }[] = []
    timeline.push(makeTimelineItem('backend.request_received', { ts: Date.now(), origin: 'backend', category: 'state', meta: { description: 'direct-review request received' } }))

    // 保存上传文件为 artifacts
    const savedFiles: any[] = []
    try {
      const { saveArtifactFromPath } = require('./artifacts')
      for (const f of files) {
        try { const a = await saveArtifactFromPath(f.path, `direct_upload_${f.originalname}`); savedFiles.push(a) } catch {}
      }
      const it = makeTimelineItem('backend.saved_uploads', { ts: Date.now(), origin: 'backend', category: 'io', meta: { description: 'Saved uploaded files for direct-review', files: savedFiles } })
      timeline.push(it)
      if (progressId) pushProgress(progressId, it)
    } catch (e) {}

    // 不使用视觉模块；若前端提供 enrichedJson 可作为上下文，否则直接将图片以 data URL 附在请求中交给大模型处理
    let reply = ''
    try {
      // 解析历史（若存在）
      let history: any[] = []
      if (body.history) {
        try { history = typeof body.history === 'string' ? JSON.parse(body.history) : body.history } catch { history = [] }
      }

      // 构造模型提示：包含系统提示、设计需求与设计规范
      const promptParts: string[] = []
      if (systemPrompt && String(systemPrompt).trim()) promptParts.push(`System Prompt:\n${systemPrompt}\n`)
      if (requirements && String(requirements).trim()) promptParts.push(`Design requirements:\n${requirements}\n`)
      if (specs && String(specs).trim()) promptParts.push(`Design specs:\n${specs}\n`)

      // 附件：将上传的图片或 PDF 转为 data URL 并嵌入提示（注意：可能很大）
      if (files.length > 0) {
        const attachLines: string[] = []
        for (const f of files) {
          try {
            const buf = fs.existsSync(f.path) ? fs.readFileSync(f.path) : null
            if (!buf) continue
            const mime = f.mimetype || 'application/octet-stream'
            const b64 = buf.toString('base64')
            // 为避免提示过长，可只在 prompt 中包含文件名和可访问 URL；但若上游模型支持 data URL，可直接包含
            const dataUrl = `data:${mime};base64,${b64}`
            attachLines.push(`File: ${f.originalname}\nDataURL:\n${dataUrl}\n`)
          } catch (e) {
            // 忽略单个文件转码错误
          }
        }
        if (attachLines.length > 0) promptParts.push(`Attached files (data URLs):\n${attachLines.join('\n')}`)
      }

      // 指示模型输出格式：先输出问题确认（若有），再输出评审报告；不要返回结构化 JSON
      promptParts.push('请先给出任何必要的【问题确认】（若存在），每条一行；如果无需澄清，直接输出完整的【评审报告】（Markdown 格式，包含概述、问题与建议、结论）。请不要返回结构化 JSON 文件。')

      const messageToLLM = promptParts.join('\n\n') + '\n\nUser dialog/context:\n' + (body.dialog || '')

      // 调用文本对话接口，让模型直接基于图片和提示生成问题确认与评审报告
      reply = await deepseekTextDialog(apiUrl, messageToLLM, model, authHeader, systemPrompt, history)
    } catch (e) {
      logError('direct-review.llm_failed', { error: String(e) })
      throw e
    }

    // LLM 已直接返回文本回复（包含问题确认与评审报告），将该回复作为最终 markdown 返回
    timeline.push(makeTimelineItem('llm.analysis_start', { ts: Date.now(), origin: 'backend', category: 'llm', meta: { description: 'direct-review LLM analysis (raw reply) start' } }))
    if (progressId) pushProgress(progressId, timeline[timeline.length-1])

    const markdown = reply || ''

    timeline.push(makeTimelineItem('llm.analysis_done', { ts: Date.now(), origin: 'backend', category: 'llm', meta: { description: 'direct-review LLM analysis (raw reply) done' } }))
    if (progressId) pushProgress(progressId, timeline[timeline.length-1])

    // 保存并返回 LLM 原始回复
    try {
      const { saveArtifact } = require('./artifacts')
      const reportA = await saveArtifact(String(markdown || ''), `direct_review_report_${Date.now()}`, { ext: '.md', contentType: 'text/markdown' })
      timeline.push(makeTimelineItem('analysis.result', { ts: Date.now(), origin: 'backend', category: 'llm', meta: { description: 'direct-review result', artifacts: { result: reportA } } }))
      if (progressId) pushProgress(progressId, timeline[timeline.length-1])
    } catch {}

    const responseBody: any = { markdown }
    try { responseBody.timeline = timeline } catch {}
    try { responseBody.savedFiles = savedFiles } catch {}
    return res.json(responseBody)
  } catch (e: any) {
    logError('/api/direct-review error', { error: String(e?.message || e) })
    res.status(502).json({ error: e?.message || 'upstream error' })
  } finally {
    try {
      const maybeFiles = (req as any).files
      const files = Array.isArray(maybeFiles) ? maybeFiles : []
      files.forEach((f: any) => { if (f && f.path && fs.existsSync(f.path)) fs.unlink(f.path, () => {}) })
    } catch (e) {}
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


