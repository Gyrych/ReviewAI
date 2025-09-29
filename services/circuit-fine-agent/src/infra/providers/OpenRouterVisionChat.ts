import fetch from 'node-fetch'

export class OpenRouterVisionChat {
  constructor(private base: string, private timeoutMs: number) {}

  async chatRich(params: { apiUrl: string, model: string, messages: any[], headers?: Record<string,string>, timeoutMs?: number }) {
    const url = `${params.apiUrl}/v1/vision/chat`
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(params.headers || {}) }, body: JSON.stringify({ model: params.model, messages: params.messages }), timeout: params.timeoutMs || this.timeoutMs })
    const json = await res.json()
    return json
  }
}


