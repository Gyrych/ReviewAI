/*
功能：结构化识别用例（StructuredRecognitionUseCase）
用途：对图片进行多轮识别，必要时结合联网搜索，最终汇总为结构化 JSON。
参数：
- constructor(vision, search, timeline)
- execute({ images, visionModel, enableSearch?, searchTopN?, progressId })
返回：
- Promise<{ circuit: any; timeline: any[] }>
示例：
// const uc = new StructuredRecognitionUseCase(vision, search, timeline)
// const out = await uc.execute({ images, visionModel, progressId })
*/
// 中文注释：固定5轮识别 + 可选 datasheet 搜索 + consolidate
export class StructuredRecognitionUseCase {
    constructor(vision, search, timeline) {
        this.vision = vision;
        this.search = search;
        this.timeline = timeline;
    }
    async execute(params) {
        const P = 5;
        const tl = [];
        const { images, visionModel, enableSearch, searchTopN, progressId } = params;
        // 多轮：串行收集5轮结果
        const passResults = [];
        for (let i = 0; i < P; i++) {
            const step = this.timeline.make('vision_model_request', { passNumber: i + 1, passOfTotal: P });
            tl.push(step);
            await this.timeline.push(progressId, step);
            const r = await this.vision.recognizeSingle(images[0], 'Recognize circuit JSON only.', visionModel);
            passResults.push(r);
            const resp = this.timeline.make('vision_model_response', { passNumber: i + 1, passOfTotal: P, summary: { components: r.components.length, nets: r.nets.length } });
            tl.push(resp);
            await this.timeline.push(progressId, resp);
        }
        // consolidate：合并 5 轮结果
        const consolidateStart = this.timeline.make('recognition_consolidation_start', { resultCount: passResults.length });
        tl.push(consolidateStart);
        await this.timeline.push(progressId, consolidateStart);
        let circuit = await this.vision.consolidate(passResults, visionModel);
        const consolidateDone = this.timeline.make('recognition_consolidation_done', { resultCount: passResults.length, consolidatedComponents: circuit.components.length, consolidatedConnections: circuit.nets.length });
        tl.push(consolidateDone);
        await this.timeline.push(progressId, consolidateDone);
        // 可选：datasheet 搜索（针对包含 IC/芯片类型的组件关键字做粗搜）
        if (enableSearch) {
            const topN = Number(searchTopN || 5);
            for (const c of circuit.components) {
                try {
                    const label = (c.label || '').trim();
                    const type = (c.type || '').toLowerCase();
                    if (!label && !/ic|chip|opamp|op-amp|amplifier/.test(type))
                        continue;
                    const q = (label || type).slice(0, 64) + ' datasheet';
                    const found = await this.search.search(q, topN);
                    // 简单记录到 metadata.datasheetMeta
                    if (!circuit.metadata)
                        circuit.metadata = {};
                    if (!Array.isArray(circuit.datasheetMeta))
                        circuit.datasheetMeta = [];
                    if (found && found.length > 0) {
                        circuit.datasheetMeta.push({ componentName: label || type, sourceUrl: found[0].url, sourceType: 'third-party', confidence: 0.7 });
                    }
                }
                catch { }
            }
            const dsDone = this.timeline.make('backend.datasheets_fetch_done', { datasheetCount: circuit.datasheetMeta?.length || 0 });
            tl.push(dsDone);
            await this.timeline.push(progressId, dsDone);
        }
        return { circuit, timeline: tl };
    }
}
