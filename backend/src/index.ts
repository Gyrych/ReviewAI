import express from 'express'
// 使用 require 导入 multer 以避免 TypeScript 在没有安装类型声明时报错
const multer = require('multer')
import path from 'path'
import fs from 'fs'
import { extractCircuitJsonFromImages } from './vision'
import { generateMarkdownReview } from './llm'
import { deepseekTextDialog } from './deepseek'
import { logInfo, logError, readRecentLines } from './logger'

const app = express()
const port = Number(process.env.PORT || 3001)

const upload = multer({ dest: path.join(__dirname, '..', 'uploads') })

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
    let reviewGuidelines = body.reviewGuidelines || ''
    let systemPrompt = ''
    if (body.systemPrompts) {
      try {
        const sp = typeof body.systemPrompts === 'string' ? JSON.parse(body.systemPrompts) : body.systemPrompts
        if (sp) {
          systemPrompt = sp.systemPrompt || ''
          requirements = (systemPrompt ? systemPrompt + '\n\n' : '') + (sp.requirements || requirements)
          specs = (sp.specs || specs)
          reviewGuidelines = (sp.reviewGuidelines || reviewGuidelines)
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
      const message = `Please review the following design requirements and return a Markdown review.\n\nDesign requirements:\n${requirements}\n\nDesign specs:\n${specs}\n\nReview guidelines:\n${reviewGuidelines}`
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
    if (files.length > 0) {
      // 将 multer 文件对象转为更简单的结构并调用 vision 模块
      const imgs = files.map((f: any) => ({ path: f.path, originalname: f.originalname }))
      circuitJson = await extractCircuitJsonFromImages(imgs, apiUrl, model, authHeader)
    }

    // 调用 llm 生成 Markdown 评审
    const markdown = await generateMarkdownReview(circuitJson, requirements, specs, reviewGuidelines, apiUrl, model, authHeader, systemPrompt, history)

    // 返回结果
    res.json({ markdown })
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


