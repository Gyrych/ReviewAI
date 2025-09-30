// 中文注释：Redis 适配器占位（不引入依赖，用户可后续安装 ioredis/redis 客户端）；
// 为避免强依赖，这里在未安装时自动回退到内存实现。
export class ProgressRedisStore {
    constructor(client, opts) {
        this.client = client;
        this.ttlSeconds = opts?.ttlSeconds ?? 24 * 60 * 60;
        this.prefix = opts?.prefix ?? 'cagent:prog:';
    }
    key(id) { return this.prefix + id; }
    async init(id) {
        if (!this.client || !id)
            return;
        // 初始化时不写入；首次 push 设置 TTL
    }
    async push(id, item) {
        if (!this.client || !id)
            return;
        const k = this.key(id);
        try {
            const entry = JSON.stringify(item);
            // 使用 RPUSH 存储时间线条目
            await this.client.rPush(k, entry);
            await this.client.expire(k, this.ttlSeconds);
        }
        catch (e) {
            // 静默失败，避免影响主流程
        }
    }
    async get(id) {
        if (!this.client || !id)
            return [];
        const k = this.key(id);
        try {
            const arr = await this.client.lRange(k, 0, -1);
            return (arr || []).map((s) => { try {
                return JSON.parse(s);
            }
            catch {
                return null;
            } }).filter(Boolean);
        }
        catch (e) {
            return [];
        }
    }
    async clear(id) {
        if (!this.client || !id)
            return;
        const k = this.key(id);
        try {
            await this.client.del(k);
        }
        catch { }
    }
}
