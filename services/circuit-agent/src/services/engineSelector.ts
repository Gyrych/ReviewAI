/**
 * 引擎选择器（最小实现）
 *
 * 策略：auto -> native -> exa（按可用性降级）。
 */
export function selectEngine(preferred?: string): 'native' | 'exa' {
  try {
    const p = (preferred || '').toLowerCase()
    if (!p || p === 'auto') {
      // 默认选择 native，如果不存在再选 exa（此处假设 native 可用）
      return 'native'
    }
    if (p === 'native' || p === 'exa') return p as 'native' | 'exa'
    return 'native'
  } catch { return 'native' }
}

export default { selectEngine }


