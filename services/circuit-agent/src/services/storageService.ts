/**
 * 存储服务（轻量实现）
 *
 * 说明：用于保存 AnnotatedMessage 与 Citation 到本地文件系统以便审计与本地开发。
 * 该实现为最小侵入式，生产环境应替换为真正的数据库实现（SQLite/Postgres 等）。
 */
import fs from 'fs'
import path from 'path'
import dbAdapter from './dbAdapter'

const STORAGE_DIR = path.join(__dirname, '..', '..', 'storage', 'data')

// 可选数据库实例（如果可用）
let db: any = null
try {
  const dbPath = path.join(__dirname, '..', '..', '..', 'data', 'storage.sqlite')
  db = dbAdapter.createDb(dbPath)
  if (db) {
    try { db.prepare('CREATE TABLE IF NOT EXISTS annotated_message (id TEXT PRIMARY KEY, payload TEXT)').run() } catch {}
    try { db.prepare('CREATE TABLE IF NOT EXISTS citation (id TEXT PRIMARY KEY, annotated_message_id TEXT, payload TEXT)').run() } catch {}
  }
} catch {}

async function ensureDir(): Promise<void> {
  try {
    await fs.promises.mkdir(STORAGE_DIR, { recursive: true })
  } catch (e) {
    // ignore
  }
}

export async function saveAnnotatedMessage(am: any): Promise<{ path?: string, db?: boolean } | null> {
  try {
    if (db) {
      try {
        const stmt = db.prepare('INSERT OR REPLACE INTO annotated_message (id, payload) VALUES (?, ?)')
        stmt.run(am.id, JSON.stringify(am))
        return { db: true }
      } catch (e) {
        // 回退到文件存储
      }
    }
    await ensureDir()
    const id = am.id ?? ('am-' + Date.now().toString(36))
    const file = path.join(STORAGE_DIR, `annotated_${id}.json`)
    await fs.promises.writeFile(file, JSON.stringify(am, null, 2), 'utf8')
    return { path: file }
  } catch (e) {
    return null
  }
}

export async function saveCitation(c: any): Promise<{ path?: string, db?: boolean } | null> {
  try {
    if (db) {
      try {
        const stmt = db.prepare('INSERT OR REPLACE INTO citation (id, annotated_message_id, payload) VALUES (?, ?, ?)')
        stmt.run(c.id, c.annotatedMessageId ?? null, JSON.stringify(c))
        return { db: true }
      } catch (e) {
        // 回退到文件存储
      }
    }
    await ensureDir()
    const id = c.id ?? ('cit-' + Date.now().toString(36))
    const file = path.join(STORAGE_DIR, `citation_${id}.json`)
    await fs.promises.writeFile(file, JSON.stringify(c, null, 2), 'utf8')
    return { path: file }
  } catch (e) {
    return null
  }
}

export default {
  saveAnnotatedMessage,
  saveCitation,
}


