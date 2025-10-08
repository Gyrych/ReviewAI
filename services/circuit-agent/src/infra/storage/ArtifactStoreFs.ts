import fs from 'fs'
import path from 'path'
import type { ArtifactStore } from '../../domain/contracts/index.js'

// 中文注释：文件系统 Artifact 存储（隔离到子服务 storage 根目录）
export class ArtifactStoreFs implements ArtifactStore {
  constructor(private rootDir: string) {}

  private ensureDir(p: string) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
  }

  async save(content: string|Buffer, hint: string, meta?: { contentType?: string; ext?: string }): Promise<{ url: string; filename: string }> {
    const artifactsDir = path.join(this.rootDir, 'artifacts')
    this.ensureDir(artifactsDir)
    const ts = new Date().toISOString().replace(/[:]/g, '-')
    const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0')
    const safeBase = (hint || 'artifact').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
    const ext = meta?.ext || (typeof content === 'string' ? '.txt' : '.bin')
    const filename = `${ts}_${safeBase}_${rand}${ext}`
    const full = path.join(artifactsDir, filename)
    if (typeof content === 'string') fs.writeFileSync(full, content, { encoding: 'utf8' })
    else fs.writeFileSync(full, content)
    const url = `/api/v1/circuit-agent/artifacts/${filename}`
    return { url, filename }
  }
}


