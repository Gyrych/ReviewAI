import type { CircuitGraph, LlmProvider } from '../../domain/contracts/index.js'
import { TimelineService } from '../services/TimelineService.js'

// 中文注释：使用固定 gpt-5 对多份报告与附件摘要进行最终整合
export class FinalAggregationUseCase {
  constructor(private llm: LlmProvider, private timeline: TimelineService) {}

  async execute(params: {
    apiUrl: string
    model: string // 固定 openai/gpt-5
    circuit: CircuitGraph
    reports: { model: string; markdown: string }[]
    systemPrompt: string
    attachments?: { name: string; mime: string; text?: string }[]
    authHeader?: string
    progressId?: string
  }): Promise<{ markdown: string; timeline: any[] }> {
    const tl: any[] = []
    const headers: Record<string,string> = {}
    if (params.authHeader) headers['Authorization'] = params.authHeader

    const bundle = {
      circuit: params.circuit,
      reports: params.reports,
      attachments: (params.attachments || []).map(a => ({ name: a.name, mime: a.mime, text: a.text || '' }))
    }

    const userPrompt = `You are the final reviewer. Consolidate the following inputs into a single high-quality Markdown review with sections: Summary, Issues, Suggestions, Conclusion. Inputs (JSON):\n${JSON.stringify(bundle, null, 2)}`

    const start = this.timeline.make('llm.request', { model: params.model, tag: 'final_aggregate' })
    tl.push(start); await this.timeline.push(params.progressId, start)
    const resp = await this.llm.chat({ apiUrl: params.apiUrl, model: params.model, system: params.systemPrompt || '', messages: [{ role: 'user', content: userPrompt }], headers })
    const done = this.timeline.make('llm.response', { model: params.model, tag: 'final_aggregate', snippet: resp.text.slice(0, 1000) })
    tl.push(done); await this.timeline.push(params.progressId, done)

    return { markdown: resp.text, timeline: tl }
  }
}


