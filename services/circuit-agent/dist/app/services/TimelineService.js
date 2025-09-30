// 中文注释：统一时间线写入与构造
export class TimelineService {
    constructor(progress) {
        this.progress = progress;
    }
    make(step, meta) {
        return { step, ts: Date.now(), origin: 'agent', category: 'state', meta: meta || {} };
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
