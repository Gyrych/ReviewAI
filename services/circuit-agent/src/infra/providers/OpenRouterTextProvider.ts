// 中文注释：OpenRouterTextProvider 用于与上游文本模型交互，封装请求/响应格式并处理超时与重试策略
/*
功能：上游文本模型提供者（OpenRouterTextProvider）
用途：封装与 OpenRouter/OpenAI 兼容的文本对话接口，处理 headers/超时/插件扩展。
参数：
- constructor(baseUrl, defaultTimeoutMs)
- chat({ apiUrl, model, system, messages, timeoutMs?, headers?, plugins?, extraBody? })
返回：
- Promise<{ text: string; raw: string }>
示例：
// const p = new OpenRouterTextProvider(base, 60000)
// const r = await p.chat({ model, system, messages })
*/
import type { LlmProvider, Conversation } from '../../domain/contracts/index.js'
import { postJson, extractTextFromOpenAICompat } from '../http/OpenRouterClient.js'

export class OpenRouterTextProvider implements LlmProvider {
  constructor(private baseUrl: string, private defaultTimeoutMs: number) {}

  async chat(params: { apiUrl: string; model: string; system: string; messages: Conversation[]; timeoutMs?: number; headers?: Record<string,string>; plugins?: any[]; extraBody?: Record<string, any> }): Promise<{ text: string; raw: string }> {
    const url = params.apiUrl || this.baseUrl
    const headers = Object.assign({}, params.headers || {})
    const msgs = [] as any[]
    if (params.system && params.system.trim()) msgs.push({ role: 'system', content: params.system })
    for (const m of params.messages || []) msgs.push({ role: m.role, content: m.content })
    const body: any = { model: params.model, messages: msgs, stream: false }
    if (Array.isArray(params.plugins) && params.plugins.length > 0) body.plugins = params.plugins
    if (params.extraBody && typeof params.extraBody === 'object') Object.assign(body, params.extraBody)
    const resp = await postJson(url, body, headers, params.timeoutMs || this.defaultTimeoutMs)
    if (!resp.ok) throw new Error(`upstream ${resp.status}`)
    const text = extractTextFromOpenAICompat(resp.text)
    return { text, raw: resp.text }
  }
}


