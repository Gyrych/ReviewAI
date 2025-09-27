import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

// 中文注释：统一保存每步产生的 artifact（文本/JSON/二进制）到 uploads/artifacts
// 返回 { filename, path, url, size, contentType }

const ARTIFACTS_DIR = path.join(__dirname, '..', 'uploads', 'artifacts')

function ensureArtifactsDir() {
  try {
    if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })
  } catch (e) {
    // 忽略目录创建异常，调用方会记录错误
  }
}

function sanitizeFilename(s: string) {
  return String(s || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

export async function saveArtifact(content: string | Buffer, hint = 'artifact', opts?: { ext?: string; contentType?: string }) {
  ensureArtifactsDir()
  try {
    const now = new Date()
    const ts = now.toISOString().replace(/[:]/g, '-')
    const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0')
    const base = sanitizeFilename(hint)
    const ext = opts?.ext || (typeof content === 'string' ? '.txt' : '.bin')
    const filename = `${ts}_${base}_${rand}${ext}`
    const full = path.join(ARTIFACTS_DIR, filename)

    if (typeof content === 'string') {
      fs.writeFileSync(full, content, { encoding: 'utf8' })
    } else {
      fs.writeFileSync(full, content)
    }

    const stat = fs.statSync(full)
    const size = stat.size
    const url = `/api/artifacts/${filename}`
    return { filename, path: full, url, size, contentType: opts?.contentType || (typeof content === 'string' ? 'text/plain' : 'application/octet-stream') }
  } catch (e: any) {
    return { error: String(e?.message || e) }
  }
}

export function artifactsDir() {
  ensureArtifactsDir()
  return ARTIFACTS_DIR
}


// 中文注释：计算 Buffer 的 SHA-1 哈希（用于记录输入文件指纹）
export function computeSha1(buf: Buffer): string {
  try {
    return crypto.createHash('sha1').update(buf).digest('hex')
  } catch (e) {
    return ''
  }
}

// 中文注释：将现有文件复制到 artifacts 目录并生成可访问 URL
export async function saveArtifactFromPath(srcPath: string, hint = 'file', opts?: { ext?: string; contentType?: string }) {
  ensureArtifactsDir()
  try {
    const now = new Date()
    const ts = now.toISOString().replace(/[:]/g, '-')
    const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0')
    const base = sanitizeFilename(hint)
    const ext = opts?.ext || path.extname(srcPath) || ''
    const filename = `${ts}_${base}_${rand}${ext}`
    const full = path.join(ARTIFACTS_DIR, filename)
    fs.copyFileSync(srcPath, full)
    const stat = fs.statSync(full)
    const size = stat.size
    const url = `/api/artifacts/${filename}`
    const contentType = opts?.contentType || 'application/octet-stream'
    return { filename, path: full, url, size, contentType }
  } catch (e: any) {
    return { error: String(e?.message || e) }
  }
}


