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
            const fullRequest = { model, system: params.systemPrompt || '', messages: [{ role: 'user', content: userPrompt }], apiUrl: params.apiUrl, headers };
            const start = this.timeline.make('llm.request', { model, tag: 'parallel_review' });
            // 将完整请求体保存在条目上
            start.requestFull = fullRequest;
            start.origin = 'llm';
            tl.push(start);
            await this.timeline.push(params.progressId, start);
            const resp = await this.llm.chat({ apiUrl: params.apiUrl, model, system: params.systemPrompt || '', messages: [{ role: 'user', content: userPrompt }], headers });
            const done = this.timeline.make('llm.response', { model, tag: 'parallel_review', snippet: String(resp.text || '').slice(0, 500) });
            done.responseFull = resp.raw || resp.text;
            done.origin = 'llm';
            tl.push(done);
            await this.timeline.push(params.progressId, done);
            return { model, markdown: resp.text };
        });
        const reports = await Promise.all(tasks);
        return { reports, timeline: tl };
    }
}
