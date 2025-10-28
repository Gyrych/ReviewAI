/**
 * 前端 API 客户端（轻量封装）
 *
 * 提供与后端 search-summary endpoint 的交互函数，便于在 UI 中调用并获取解析后的 citations 等元数据。
 */
import { getAgentBase } from '../config/apiBase'

export async function postSearchSummary(agentId: 'circuit' | 'circuit-fine', providerResponse: any) {
  try {
    const base = getAgentBase(agentId)
    const url = `${String(base).replace(/\/$/, '')}/search-summary`
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response: providerResponse }) })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(txt || `HTTP ${res.status}`)
    }
    const data = await res.json()
    // 兼容处理：确保包含 citations 与 searchSummaries 字段
    data.citations = data.citations || []
    data.searchSummaries = data.searchSummaries || []
    return data
  } catch (e) {
    throw e
  }
}

export default { postSearchSummary }


