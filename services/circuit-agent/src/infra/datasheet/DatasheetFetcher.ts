// 中文注释：DatasheetFetcher 用于从供应商或在线资源抓取器件数据表并解析为结构化材料，用于识别与匹配。
// 该文件为占位实现，实际抓取逻辑应包含重试、速率限制与错误退避策略。

export async function fetchDatasheet(url: string): Promise<{ content: string } | null> {
  // TODO: 实现实际网络抓取与解析逻辑；当前为占位返回 null
  return null
}

import fetch from 'node-fetch'
import type { ArtifactStore } from '../../domain/contracts/index.js'

const DEFAULT_TIMEOUT_MS = Number(process.env.DATASHEET_FETCH_TIMEOUT_MS || 15000)
const DEFAULT_MAX_BYTES = Number(process.env.DATASHEET_MAX_BYTES || 5_000_000)
const ALLOWED_TYPES = (process.env.DATASHEET_ALLOWED_CONTENT_TYPES || 'application/pdf,text/html,text/plain,application/json').split(',')

function timeout(ms: number) {
  return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
}

export async function fetchAndSaveDatasheets(urls: string[], artifactStore: ArtifactStore, opts?: { timeoutMs?: number; maxBytes?: number }) {
  const out: Array<{ sourceUrl: string; url: string; filename: string; contentType?: string }> = []
  const timeoutMs = (opts && opts.timeoutMs) || DEFAULT_TIMEOUT_MS
  const maxBytes = (opts && opts.maxBytes) || DEFAULT_MAX_BYTES

  for (const u of urls) {
    try {
      const controller = new AbortController()
      const signal = controller.signal
      const race = Promise.race([fetch(u, { signal }), timeout(timeoutMs)]) as Promise<any>
      const res = await race
      if (!res || !res.ok) continue
      const ct = String(res.headers.get('content-type') || '').split(';')[0].trim()
      if (!ALLOWED_TYPES.some(t => ct.includes(t))) continue
      const arrayBuf = await res.arrayBuffer()
      const buf = Buffer.from(arrayBuf)
      if (buf.length > maxBytes) continue
      const ext = ct.includes('pdf') ? '.pdf' : (ct.includes('json') ? '.json' : (ct.includes('html') ? '.html' : '.txt'))
      const saved = await artifactStore.save(buf, 'datasheet', { ext, contentType: ct })
      out.push({ sourceUrl: u, url: saved.url, filename: saved.filename, contentType: ct })
    } catch (e) {
      // ignore individual fetch errors
      try { console.log(`[DatasheetFetcher] failed to fetch ${u}: ${String((e as Error).message || e)}`) } catch {}
      continue
    }
  }

  return out
}


