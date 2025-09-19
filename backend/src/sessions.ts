import fs from 'fs'
import path from 'path'

// 中文注释：会话存储工具，负责生成文件名、保存、列出、读取与删除

export type SessionHistory = { role: 'user' | 'assistant'; content: string }

export type SessionFileV1 = {
  id?: string
  version: 1
  createdAt?: string
  source?: 'circuit' | 'code' | 'doc' | 'req'
  apiUrl: string
  model: string
  customModelName?: string
  requirements: string
  specs: string
  questionConfirm: string
  dialog: string
  history: SessionHistory[]
  markdown: string
  enrichedJson?: any
  overlay?: any
  files?: { name: string; type: string; size: number; lastModified?: number; dataBase64: string }[]
}

export type SessionListItem = {
  id: string
  filename: string
  createdAt: string
  apiHost?: string
  model?: string
  hasFiles?: boolean
}

export const SESSIONS_DIR = path.join(__dirname, '..', 'sessions')

// 中文注释：确保会话目录存在
export function ensureSessionsDir(): void {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true })
  } catch (e) {
    // 忽略目录创建异常，交由上游报错
  }
}

// 中文注释：简单的 id 校验，防止路径穿越
export function sanitizeId(id: string): string {
  return (id || '').replace(/[^a-zA-Z0-9._-]/g, '')
}

// 中文注释：格式化日期为 YYYY-MM-DDTHH-mm-ss-SSS（避免 Windows 上的冒号）
function formatDateForFilename(d: Date): string {
  const pad = (n: number, w = 2) => n.toString().padStart(w, '0')
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const hh = pad(d.getHours())
  const mm = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  const ms = pad(d.getMilliseconds(), 3)
  return `${y}-${m}-${day}T${hh}-${mm}-${ss}-${ms}`
}

// 中文注释：基于当天已有文件数量计算 4 位当日流水号
function nextSequenceForDate(d: Date): number {
  try {
    const prefix = `session_${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
    const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    return files.length + 1
  } catch (e) {
    return 1
  }
}

// 中文注释：随机 4 位十六进制后缀
function randomSuffix(): string {
  return Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, '0')
}

// 中文注释：生成会话文件名（含当日流水号与随机后缀）
export function generateSessionFilename(now = new Date()): { id: string; filename: string; createdAt: string } {
  const ts = formatDateForFilename(now)
  const seq = nextSequenceForDate(now).toString().padStart(4, '0')
  const rand = randomSuffix()
  const id = `session_${ts}_${seq}_${rand}`
  const filename = `${id}.json`
  const createdAt = now.toISOString()
  return { id, filename, createdAt }
}

// 中文注释：保存会话内容到文件
export function saveSession(payload: SessionFileV1): { id: string; filename: string; createdAt: string } {
  ensureSessionsDir()
  const meta = generateSessionFilename(new Date())
  const toSave: SessionFileV1 = Object.assign({}, payload, {
    id: meta.id,
    version: 1 as const,
    createdAt: meta.createdAt,
  })
  const full = path.join(SESSIONS_DIR, meta.filename)
  fs.writeFileSync(full, JSON.stringify(toSave, null, 2), { encoding: 'utf8' })
  return meta
}

// 中文注释：列出最近的会话（倒序，最多 limit 条）
export function listSessions(limit = 10): SessionListItem[] {
  ensureSessionsDir()
  const files = fs
    .readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const full = path.join(SESSIONS_DIR, f)
      const stat = fs.statSync(full)
      return { f, mtimeMs: stat.mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, Math.max(1, Math.min(100, limit)))

  const items: SessionListItem[] = []
  for (const it of files) {
    try {
      const full = path.join(SESSIONS_DIR, it.f)
      const raw = fs.readFileSync(full, 'utf8')
      const j = JSON.parse(raw)
      const apiUrl: string = j.apiUrl || ''
      let apiHost: string | undefined
      try {
        const u = new URL(apiUrl)
        apiHost = u.origin
      } catch (e) {
        apiHost = apiUrl
      }
      const createdAt: string = j.createdAt || new Date(it.mtimeMs).toISOString()
      const id = path.basename(it.f, '.json')
      const hasFiles = Array.isArray(j.files) && j.files.length > 0
      items.push({ id, filename: it.f, createdAt, apiHost, model: j.customModelName || j.model, hasFiles })
    } catch (e) {
      // 忽略单个文件解析错误
    }
  }
  return items
}

// 中文注释：加载单个会话
export function loadSession(id: string): SessionFileV1 {
  ensureSessionsDir()
  const safe = sanitizeId(id)
  const full = path.join(SESSIONS_DIR, `${safe}.json`)
  if (!fs.existsSync(full)) throw new Error('session not found')
  const raw = fs.readFileSync(full, 'utf8')
  const j = JSON.parse(raw)
  return j
}

// 中文注释：删除单个会话
export function deleteSession(id: string): void {
  ensureSessionsDir()
  const safe = sanitizeId(id)
  const full = path.join(SESSIONS_DIR, `${safe}.json`)
  if (!fs.existsSync(full)) return
  fs.unlinkSync(full)
}


