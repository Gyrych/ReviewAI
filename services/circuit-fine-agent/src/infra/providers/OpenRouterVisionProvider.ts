import { OpenRouterVisionProvider as Impl } from '../../../../circuit-agent/src/infra/providers/OpenRouterVisionProvider'
import fetch from 'node-fetch'

export class OpenRouterVisionProvider {
  constructor(private base: string, private timeoutMs: number) {}

  async recognize(params: { apiUrl: string, visionModel: string, images: { name: string, mime: string, bytes: Buffer }[], timeoutMs?: number }) {
    // 简化实现：将图片以 base64 发送到一个假设的接口，实际项目中应使用真正的视觉识别实现
    const url = `${params.apiUrl}/v1/vision/recognize`
    const imgs = (params.images || []).map(i => ({ name: i.name, mime: i.mime, b64: Buffer.from(i.bytes).toString('base64') }))
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: params.visionModel, images: imgs }), timeout: params.timeoutMs || this.timeoutMs })
    const json = await res.json()
    return json
  }
}


