import { describe, it, expect } from 'vitest'
import { timeoutMiddleware } from '../src/middleware/timeoutMiddleware'
import { BudgetController } from '../src/services/budgetControl'

describe('timeout & budget basic integration', () => {
  it('timeoutMiddleware should return a middleware function and not throw', () => {
    const mw = timeoutMiddleware({ softMs: 10, hardMs: 20 })
    const req: any = { method: 'GET', path: '/test' }
    const res: any = { on: (_: string, __: any) => {}, status: () => ({ json: () => {} }), end: () => {} }
    let called = false
    const next = () => { called = true }
    expect(() => mw(req, res, next)).not.toThrow()
    expect(called).toBe(true)
  })

  it('BudgetController should consume and reset budget correctly', () => {
    const bc = new BudgetController()
    const reqId = 'r1'
    const remain1 = bc.consume(reqId, 1000)
    expect(typeof remain1).toBe('number')
    bc.reset(reqId)
    const remain2 = bc.consume(reqId, 10)
    expect(typeof remain2).toBe('number')
  })
})


