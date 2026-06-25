import { describe, it, expect, vi } from 'vitest'
import { estimateCostUsd, type TokenUsage } from './pricing'

function usage(over: Partial<TokenUsage> = {}): TokenUsage {
  return { input_tokens: 0, output_tokens: 0, ...over }
}

describe('estimateCostUsd', () => {
  it('returns null when usage is missing', () => {
    expect(estimateCostUsd('claude-haiku-4-5', null)).toBeNull()
    expect(estimateCostUsd('claude-haiku-4-5', undefined)).toBeNull()
  })

  it('returns null for an unknown model rather than guessing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(estimateCostUsd('gpt-4', usage({ input_tokens: 1000, output_tokens: 1000 }))).toBeNull()
    warn.mockRestore()
  })

  it('prices haiku at $1 in / $5 out per 1M tokens', () => {
    // 1M in + 1M out = $1 + $5 = $6
    expect(estimateCostUsd('claude-haiku-4-5', usage({ input_tokens: 1_000_000, output_tokens: 1_000_000 }))).toBe(6)
  })

  it('prices sonnet at $3 in / $15 out per 1M tokens', () => {
    expect(estimateCostUsd('claude-sonnet-4-6', usage({ input_tokens: 1_000_000, output_tokens: 1_000_000 }))).toBe(18)
  })

  it('computes a realistic small batch cost', () => {
    // 9000 in * $1/1M + 600 out * $5/1M = 0.009 + 0.003 = 0.012
    expect(estimateCostUsd('claude-haiku-4-5', usage({ input_tokens: 9000, output_tokens: 600 }))).toBe(0.012)
  })

  it('rounds to 6 decimal places', () => {
    // 1 in * $1/1M = 0.000001 exactly
    expect(estimateCostUsd('claude-haiku-4-5', usage({ input_tokens: 1, output_tokens: 0 }))).toBe(0.000001)
  })

  it('treats zero tokens as $0, not null', () => {
    expect(estimateCostUsd('claude-haiku-4-5', usage())).toBe(0)
  })
})
