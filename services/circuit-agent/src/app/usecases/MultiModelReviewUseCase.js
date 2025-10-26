/*
功能：多模型评审用例（MultiModelReviewUseCase）
用途：并行调用多个文本模型对同一输入进行评审，收集与汇总结果。
参数：
- constructor(llm, timeline)
- execute({ apiUrl, models, circuit, requirements?, specs?, progressId, authHeader? })
返回：
- Promise<{ items: { model: string; text: string }[]; timeline: any[] }>
示例：
// const uc = new MultiModelReviewUseCase(llm, timeline)
// const r = await uc.execute({ apiUrl, models: ['openai/gpt-5'], circuit })
*/
// 中文注释：并行对多个文本 LLM 进行评审
export class MultiModelReviewUseCase {
    constructor(llm, timeline) {
        this.llm = llm;
        this.timeline = timeline;
    }
    async execute(params) {
        const tl = [];
        const headers = {};
        if (params.authHeader)
            headers['Authorization'] = params.authHeader;
        const userPrompt = `Circuit JSON:\n${JSON.stringify(params.circuit, null, 2)}\n\nDesign requirements:\n${params.requirements || ''}\n\nDesign specs:\n${params.specs || ''}`;
        const tasks = (params.models || []).map(async (model) => {
            const start = this.timeline.make('llm.request', { model, tag: 'parallel_review' });
            tl.push(start);
            await this.timeline.push(params.progressId, start);
            const resp = await this.llm.chat({ apiUrl: params.apiUrl, model, system: params.systemPrompt || '', messages: [{ role: 'user', content: userPrompt }], headers });
            const done = this.timeline.make('llm.response', { model, tag: 'parallel_review', snippet: resp.text.slice(0, 500) });
            tl.push(done);
            await this.timeline.push(params.progressId, done);
            return { model, markdown: resp.text };
        });
        const reports = await Promise.all(tasks);
        return { reports, timeline: tl };
    }
}
