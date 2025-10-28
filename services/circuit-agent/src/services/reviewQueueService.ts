/**
 * 简单的人工复核队列服务（示例实现）
 */
export type ReviewJob = {
  id: string
  annotatedMessageId: string
  status: 'pending' | 'assigned' | 'reviewed' | 'rejected'
  assignedTo?: string
  createdAt: string
}

export class ReviewQueueService {
  private jobs: Map<string, ReviewJob> = new Map()

  enqueue(job: ReviewJob) { this.jobs.set(job.id, job); return job }
  dequeue(): ReviewJob | null {
    for (const v of this.jobs.values()) {
      if (v.status === 'pending') { v.status = 'assigned'; return v }
    }
    return null
  }
  markReviewed(id: string) { const j = this.jobs.get(id); if (j) j.status = 'reviewed' }
  listPending() { return Array.from(this.jobs.values()).filter((j) => j.status === 'pending') }
}


