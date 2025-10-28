import { describe, it, expect } from 'vitest'
import { validateRoundConfig } from '../src/validators/roundConfigValidator'

describe('roundConfigValidator', () => {
  it('validates max_results and context_scale', () => {
    expect(validateRoundConfig({ max_results: 5, context_scale: 'high' }).valid).toBe(true)
    expect(validateRoundConfig({ max_results: 11, context_scale: 'high' }).valid).toBe(false)
    expect(validateRoundConfig({ max_results: 3, context_scale: 'x' }).valid).toBe(false)
  })
})


