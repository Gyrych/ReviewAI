/**
 * 成本/预算保护模块（示例实现）
 * - 提供简单的令牌预算检查与消耗计数
 * - 在请求级别使用 RoundConfig.budget_tokens 与实际消耗比较
 */
export class BudgetController {
  private defaultBudget = 16000

  constructor(private readonly store: Map<string, number> = new Map()) {}

  // 获取预算
  getBudget(requestId: string, override?: number) {
    return override ?? this.defaultBudget
  }

  // 扣减预算，返回剩余
  consume(requestId: string, tokens: number) {
    const used = this.store.get(requestId) ?? 0
    const remain = Math.max(0, this.getBudget(requestId) - (used + tokens))
    this.store.set(requestId, used + tokens)
    return remain
  }

  // 重置预算计数（回滚/结束时调用）
  reset(requestId: string) { this.store.delete(requestId) }
}


