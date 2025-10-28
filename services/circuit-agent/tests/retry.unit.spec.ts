import { describe, it, expect } from 'vitest'
import { retryOnce } from '../src/utils/retry'

describe('retryOnce', () => {
  it('should return value when first attempt succeeds', async () => {
    const fn = async () => 42
    await expect(retryOnce(fn)).resolves.toBe(42)
  })

  it('should retry once and succeed on second attempt', async () => {
    let calls = 0
    const fn = async () => {
      calls++
      if (calls === 1) throw new Error('fail once')
      return 'ok'
    }
    await expect(retryOnce(fn)).resolves.toBe('ok')
    expect(calls).toBe(2)
  })

  it('should throw if both attempts fail', async () => {
    const fn = async () => { throw new Error('always fail') }
    await expect(retryOnce(fn)).rejects.toThrow('always fail')
  })
})


