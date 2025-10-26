/*
功能：上游多模态聊天提供者（OpenRouterVisionChat）
用途：调用 OpenRouter/OpenAI 兼容接口进行富消息（图文）对话，封装请求与文本提取。
参数：
- constructor(baseUrl, defaultTimeoutMs)
- chatRich({ apiUrl, model, messages, timeoutMs?, headers? })
返回：
- Promise<{ text: string; raw: string }>
示例：
// const p = new OpenRouterVisionChat(base, 60000)
// const r = await p.chatRich({ model, messages })
*/
import type { VisionChatProvider, RichMessage } from '../../domain/contracts/index.js'
import { postJson, extractTextFromOpenAICompat } from '../http/OpenRouterClient.js'

// 中文注释：OpenRouter 富消息聊天（多模态）
export class OpenRouterVisionChat implements VisionChatProvider {
  constructor(private baseUrl: string, private defaultTimeoutMs: number) {}

  async chatRich(params: { apiUrl: string; model: string; messages: RichMessage[]; timeoutMs?: number; headers?: Record<string,string> }): Promise<{ text: string; raw: string }> {
    const url = params.apiUrl || this.baseUrl
    const timeout = params.timeoutMs || this.defaultTimeoutMs
    const headers = Object.assign({}, params.headers || {})
    const body = { model: params.model, messages: params.messages, stream: false }
    const resp = await postJson(url, body, headers, timeout)
    if (!resp.ok) throw new Error(`upstream ${resp.status}`)
    const text = extractTextFromOpenAICompat(resp.text)
    return { text, raw: resp.text }
  }
}


