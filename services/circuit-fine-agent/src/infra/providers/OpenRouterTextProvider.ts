import fetch from 'node-fetch'

export class OpenRouterTextProvider {
  constructor(private base: string, private timeoutMs: number) {}

  async chat(params: { apiUrl: string, model: string, messages: any[], headers?: Record<string,string>, timeoutMs?: number }) {
    const url = `${params.apiUrl}/v1/chat/completions`
    const body = { model: params.model, messages: params.messages }
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(params.headers || {}) }, body: JSON.stringify(body), timeout: params.timeoutMs || this.timeoutMs })
    const txt = await res.text()
    return { text: txt }
  }
}


