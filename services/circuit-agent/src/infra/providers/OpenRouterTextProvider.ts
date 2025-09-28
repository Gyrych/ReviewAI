import type { LlmProvider, Conversation } from '../../domain/contracts/index.js'
import { postJson, extractTextFromOpenAICompat } from '../http/OpenRouterClient.js'

export class OpenRouterTextProvider implements LlmProvider {
  constructor(private baseUrl: string, private defaultTimeoutMs: number) {}

  async chat(params: { apiUrl: string; model: string; system: string; messages: Conversation[]; timeoutMs?: number; headers?: Record<string,string> }): Promise<{ text: string; raw: string }> {
    const url = params.apiUrl || this.baseUrl
    const headers = Object.assign({}, params.headers || {})
    const msgs = [] as any[]
    if (params.system && params.system.trim()) msgs.push({ role: 'system', content: params.system })
    for (const m of params.messages || []) msgs.push({ role: m.role, content: m.content })
    const body = { model: params.model, messages: msgs, stream: false }
    const resp = await postJson(url, body, headers, params.timeoutMs || this.defaultTimeoutMs)
    if (!resp.ok) throw new Error(`upstream ${resp.status}`)
    const text = extractTextFromOpenAICompat(resp.text)
    return { text, raw: resp.text }
  }
}


