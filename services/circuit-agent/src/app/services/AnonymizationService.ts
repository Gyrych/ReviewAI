// 中文注释：输入脱敏服务——弱化显性 PII（邮箱、电话、地址），替换为 [REDACTED]
import type { Anonymizer, ReviewRequest, CircuitGraph } from '../../domain/contracts/index.js'

export class AnonymizationService implements Anonymizer {
  private extraPatterns: RegExp[]

  constructor(extraSensitiveWords: string[] = []) {
    // 中文注释：支持自定义敏感词；构建简单词边界匹配
    this.extraPatterns = extraSensitiveWords
      .filter(Boolean)
      .map(w => new RegExp(`\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\b`, 'gi'))
  }

  scrubInput<T = any>(input: T): T {
    try {
      const s = JSON.stringify(input)
      const redacted = s
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
        .replace(/\b\+?\d[\d\s-]{6,}\b/g, '[REDACTED_PHONE]')
        .replace(/\b\d{1,5}\s+[A-Za-z0-9\s.,-]{3,}\b/g, '[REDACTED_ADDR]')
        // 额外敏感词
        .replace(/.*/gs, (line) => {
          let out = line
          for (const rx of this.extraPatterns) out = out.replace(rx, '[REDACTED]')
          return out
        })
      return JSON.parse(redacted)
    } catch {
      return input
    }
  }
}


