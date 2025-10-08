import type { VisionProvider, Attachment, CircuitGraph } from '../../domain/contracts/index.js'
import { postJson } from '../http/OpenRouterClient.js'

// 中文注释：视觉识别 Provider（单轮 + consolidate），遵循 OpenAI 兼容接口；
// - 单轮：将图片转为 data URL + 文本 prompt；
// - consolidate：传入 JSON 列表，请上游返回合并后的 JSON。

export class OpenRouterVisionProvider implements VisionProvider {
  constructor(private baseUrl: string, private defaultTimeoutMs: number) {}

  async recognizeSingle(image: Attachment, prompt: string, model: string): Promise<CircuitGraph> {
    const dataUrl = `data:${image.mime};base64,${Buffer.from(image.bytes).toString('base64')}`
    const body = {
      model,
      messages: [
        { role: 'system', content: 'You are an expert circuit diagram parser. Return ONLY JSON with keys: components[], nets[]; no extra text.' },
        { role: 'user', content: [ { type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } } ] }
      ],
      stream: false
    }
    const headers: Record<string,string> = {}
    const url = this.baseUrl
    const resp = await postJson(url, body, headers, this.defaultTimeoutMs)
    if (!resp.ok) throw new Error(`vision upstream ${resp.status}`)
    // 简化解析：尝试从文本中提取 JSON
    const parsed = this.extractJson(resp.text)
    if (!parsed) return { components: [], nets: [] }
    return this.normalize(parsed)
  }

  async recognizeMultiPass(images: Attachment[], model: string, passes: 5): Promise<CircuitGraph[]> {
    // 中文注释：多轮由 orchestrator 控制；此处保守实现单轮识别对同一张图重复调用
    const out: CircuitGraph[] = []
    const prompt = 'Recognize components and connections. Return only JSON.'
    for (const img of images) {
      const r = await this.recognizeSingle(img, prompt, model)
      out.push(r)
    }
    return out
  }

  async consolidate(results: CircuitGraph[], model: string): Promise<CircuitGraph> {
    const body = {
      model,
      messages: [
        { role: 'system', content: 'You consolidate multiple circuit recognition JSON results into a single best JSON. Return ONLY JSON (components[], nets[], metadata?).' },
        { role: 'user', content: JSON.stringify(results, null, 2) }
      ],
      stream: false
    }
    const headers: Record<string,string> = {}
    const resp = await postJson(this.baseUrl, body, headers, this.defaultTimeoutMs)
    if (!resp.ok) throw new Error(`consolidation upstream ${resp.status}`)
    const parsed = this.extractJson(resp.text)
    if (!parsed) return { components: [], nets: [] }
    return this.normalize(parsed)
  }

  private extractJson(txt: string): any | null {
    try {
      const j = JSON.parse(txt)
      if (j.choices && j.choices[0]) {
        const c = j.choices[0]
        const content = (c.message && c.message.content) || c.text || ''
        const m = content && content.match(/\{[\s\S]*\}/)
        if (m) { try { return JSON.parse(m[0]) } catch {} }
      }
    } catch {}
    const m2 = txt.match(/\{[\s\S]*\}/)
    if (m2) { try { return JSON.parse(m2[0]) } catch {} }
    return null
  }

  private normalize(raw: any): CircuitGraph {
    const comps = Array.isArray(raw.components) ? raw.components : []
    const netsIn = Array.isArray(raw.nets) ? raw.nets : []
    // 兼容 connections -> nets 的简单转换
    let nets = netsIn
    if ((!nets || nets.length === 0) && Array.isArray(raw.connections)) {
      let idx = 1
      const tmp: any[] = []
      for (const c of raw.connections) {
        const pins: string[] = []
        try { if (c?.from?.componentId && c?.from?.pin) pins.push(`${c.from.componentId}.${c.from.pin}`) } catch {}
        try { if (c?.to?.componentId && c?.to?.pin) pins.push(`${c.to.componentId}.${c.to.pin}`) } catch {}
        if (pins.length >= 2) tmp.push({ netId: `N${idx++}`, connectedPins: pins.map(p => { const [cid, pin] = p.split('.'); return { componentId: cid, pin } }) })
      }
      nets = tmp
    }
    return { components: comps, nets }
  }
}


