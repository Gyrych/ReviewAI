export function validateRoundConfig(cfg: any) {
  const errors: string[] = []
  if (typeof cfg.max_results !== 'number' || cfg.max_results < 0 || cfg.max_results > 10) errors.push('max_results must be 0..10')
  if (!['low', 'medium', 'high'].includes(cfg.context_scale)) errors.push('context_scale must be low|medium|high')
  return { valid: errors.length === 0, errors }
}

/**
 * 验证 RoundConfig 的请求级参数
 */
export function validateRoundConfig(obj: any): { valid: boolean; errors?: string[] } {
  const errors: string[] = []
  try {
    if (obj == null) return { valid: true }
    const maxResults = Number(obj.max_results ?? obj.maxResults ?? obj.max_results)
    if (!Number.isNaN(maxResults)) {
      if (maxResults < 0 || maxResults > 10) errors.push('max_results must be between 0 and 10')
    }
    const contextScale = String(obj.context_scale || obj.contextScale || '').toLowerCase()
    if (contextScale && !['low','medium','high'].includes(contextScale)) errors.push('context_scale must be low|medium|high')
  } catch (e) { errors.push('invalid round config') }
  return { valid: errors.length === 0, errors: errors.length ? errors : undefined }
}

export default { validateRoundConfig }


