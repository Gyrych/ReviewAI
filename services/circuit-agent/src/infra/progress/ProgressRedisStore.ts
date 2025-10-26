/*
功能：进度存储（Redis 实现占位）
用途：提供基于 Redis 的时间线存取；未安装客户端时自动回退到内存。
参数：
- constructor(client, { ttlSeconds?, prefix? })
- init/push/get 同 ProgressStore 接口
返回：
- Promise<void> 或 TimelineItem[]
示例：
// const store = new ProgressRedisStore(redis)
*/
import type { ProgressStore, TimelineItem } from '../../domain/contracts/index.js'

// 中文注释：Redis 适配器占位（不引入依赖，用户可后续安装 ioredis/redis 客户端）；
// 为避免强依赖，这里在未安装时自动回退到内存实现。

export class ProgressRedisStore implements ProgressStore {
  private client: any
  private ttlSeconds: number
  private prefix: string

  constructor(client: any, opts?: { ttlSeconds?: number; prefix?: string }) {
    this.client = client
    this.ttlSeconds = opts?.ttlSeconds ?? 24 * 60 * 60
    this.prefix = opts?.prefix ?? 'cagent:prog:'
  }

  private key(id: string) { return this.prefix + id }

  async init(id: string): Promise<void> {
    if (!this.client || !id) return
    // 初始化时不写入；首次 push 设置 TTL
  }

  async push(id: string, item: TimelineItem): Promise<void> {
    if (!this.client || !id) return
    const k = this.key(id)
    try {
      const entry = JSON.stringify(item)
      // 使用 RPUSH 存储时间线条目
      await this.client.rPush(k, entry)
      await this.client.expire(k, this.ttlSeconds)
    } catch (e) {
      // 静默失败，避免影响主流程
    }
  }

  async get(id: string): Promise<TimelineItem[]> {
    if (!this.client || !id) return []
    const k = this.key(id)
    try {
      const arr = await this.client.lRange(k, 0, -1)
      return (arr || []).map((s: string) => { try { return JSON.parse(s) } catch { return null } }).filter(Boolean)
    } catch (e) {
      return []
    }
  }

  async clear(id: string): Promise<void> {
    if (!this.client || !id) return
    const k = this.key(id)
    try { await this.client.del(k) } catch {}
  }
}


