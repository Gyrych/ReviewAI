import type { Attachment, CircuitGraph, ReviewReport, SearchProvider, VisionProvider } from '../../domain/contracts/index.js'
import { TimelineService } from '../services/TimelineService.js'

// 中文注释：固定5轮识别 + 可选 datasheet 搜索 + consolidate
export class StructuredRecognitionUseCase {
  constructor(
    private vision: VisionProvider,
    private search: SearchProvider,
    private timeline: TimelineService
  ) {}

  async execute(params: {
    apiUrl: string
    visionModel: string // 固定 openai/gpt-5-mini
    images: Attachment[]
    enableSearch?: boolean
    searchTopN?: number
    progressId?: string
  }): Promise<{ circuit: CircuitGraph; timeline: any[] }> {
    const P = 5 as const
    const tl: any[] = []
    const { images, visionModel, enableSearch, searchTopN, progressId } = params

    // 多轮：串行收集5轮结果
    const passResults: CircuitGraph[] = []
    for (let i = 0; i < P; i++) {
      const step = this.timeline.make('vision_model_request', { passNumber: i+1, passOfTotal: P })
      tl.push(step); await this.timeline.push(progressId, step)
      const r = await this.vision.recognizeSingle(images[0], 'Recognize circuit JSON only.', visionModel)
      passResults.push(r)
      const resp = this.timeline.make('vision_model_response', { passNumber: i+1, passOfTotal: P, summary: { components: r.components.length, nets: r.nets.length } })
      tl.push(resp); await this.timeline.push(progressId, resp)
    }

    // consolidate：合并 5 轮结果
    const consolidateStart = this.timeline.make('recognition_consolidation_start', { resultCount: passResults.length })
    tl.push(consolidateStart); await this.timeline.push(progressId, consolidateStart)
    let circuit = await this.vision.consolidate(passResults, visionModel)
    const consolidateDone = this.timeline.make('recognition_consolidation_done', { resultCount: passResults.length, consolidatedComponents: circuit.components.length, consolidatedConnections: circuit.nets.length })
    tl.push(consolidateDone); await this.timeline.push(progressId, consolidateDone)

    // 可选：datasheet 搜索（针对包含 IC/芯片类型的组件关键字做粗搜）
    if (enableSearch) {
      const topN = Number(searchTopN || 5)
      for (const c of circuit.components) {
        try {
          const label = (c.label || '').trim()
          const type = (c.type || '').toLowerCase()
          if (!label && !/ic|chip|opamp|op-amp|amplifier/.test(type)) continue
          const q = (label || type).slice(0, 64) + ' datasheet'
          const found = await this.search.search(q, topN)
          // 简单记录到 metadata.datasheetMeta
          if (!circuit.metadata) circuit.metadata = {}
          if (!Array.isArray(circuit.datasheetMeta)) circuit.datasheetMeta = []
          if (found && found.length > 0) {
            circuit.datasheetMeta.push({ componentName: label || type, sourceUrl: found[0].url, sourceType: 'third-party', confidence: 0.7 })
          }
        } catch {}
      }
      const dsDone = this.timeline.make('backend.datasheets_fetch_done', { datasheetCount: circuit.datasheetMeta?.length || 0 })
      tl.push(dsDone); await this.timeline.push(progressId, dsDone)
    }

    return { circuit, timeline: tl }
  }
}


