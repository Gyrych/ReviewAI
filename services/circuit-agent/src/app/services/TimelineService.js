// 中文注释：统一时间线写入与构造
export class TimelineService {
    constructor(progress) {
        this.progress = progress;
    }
    // 中文注释：允许通过可选参数覆盖 origin/category，以便更准确标注来源与类别
    make(step, meta, opts) {
        const origin = (opts && opts.origin) ? opts.origin : 'agent';
        const category = (opts && opts.category) ? opts.category : 'state';
        return { step, ts: Date.now(), origin, category, meta: meta || {} };
    }
    async push(progressId, item) {
        if (!progressId)
            return;
        try {
            await this.progress.push(progressId, item);
        }
        catch { }
    }
}
