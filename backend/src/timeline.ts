// 中文注释：统一创建 timeline 项的 helper，确保所有时间线条目遵循统一 schema
export function makeTimelineItem(step: string, opts?: {
  ts?: number,
  origin?: 'frontend'|'backend'|'external',
  category?: string,
  meta?: any,
  artifacts?: any,
  tags?: string[]
}) {
  const now = typeof opts?.ts === 'number' ? opts.ts : Date.now()
  return Object.assign({
    step,
    ts: now,
    origin: opts?.origin || 'backend',
    category: opts?.category || 'other',
    meta: opts?.meta || {},
    artifacts: opts?.artifacts || {},
    tags: opts?.tags || []
  }, {})
}

// 中文注释：生成一个短摘要签名，用于前端合并/去重（可选）
export function makeRequestSignature(payload?: any): string | undefined {
  try {
    if (!payload) return undefined
    const s = typeof payload === 'string' ? payload : JSON.stringify(payload)
    // 使用简单 hash（非加密），便于快速对比；如果环境提供 crypto，可替换为更稳定的哈希
    let h = 0
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i)
      h |= 0
    }
    return 'sig_' + Math.abs(h).toString(36)
  } catch (e) { return undefined }
}


