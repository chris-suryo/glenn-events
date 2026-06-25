import { describe, it, expect, afterEach } from 'vitest'
import { showAiDebug, modelShortName, formatAiRunDebug } from './debug-format'
import type { AiRun } from '@/lib/types'

type DebugRun = Pick<AiRun, 'model' | 'total_tokens' | 'estimated_cost_usd'>

describe('modelShortName', () => {
  it('maps a model id to its family name', () => {
    expect(modelShortName('claude-haiku-4-5')).toBe('Haiku')
    expect(modelShortName('claude-sonnet-4-6')).toBe('Sonnet')
    expect(modelShortName('claude-opus-4-8')).toBe('Opus')
  })

  it('returns "unknown" for null and passes through an unrecognized id', () => {
    expect(modelShortName(null)).toBe('unknown')
    expect(modelShortName('some-future-model')).toBe('some-future-model')
  })
})

describe('showAiDebug', () => {
  const original = process.env.NEXT_PUBLIC_SHOW_AI_DEBUG
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SHOW_AI_DEBUG
    else process.env.NEXT_PUBLIC_SHOW_AI_DEBUG = original
  })

  it('is true only when the env flag is exactly "true"', () => {
    process.env.NEXT_PUBLIC_SHOW_AI_DEBUG = 'true'
    expect(showAiDebug()).toBe(true)
    process.env.NEXT_PUBLIC_SHOW_AI_DEBUG = 'false'
    expect(showAiDebug()).toBe(false)
    process.env.NEXT_PUBLIC_SHOW_AI_DEBUG = '1'
    expect(showAiDebug()).toBe(false)
    delete process.env.NEXT_PUBLIC_SHOW_AI_DEBUG
    expect(showAiDebug()).toBe(false)
  })
})

describe('formatAiRunDebug', () => {
  function mkRun(over: Partial<DebugRun> = {}): DebugRun {
    return { model: 'claude-haiku-4-5', total_tokens: 9600, estimated_cost_usd: 0.014, ...over }
  }

  it('returns null when there is no run', () => {
    expect(formatAiRunDebug(null)).toBeNull()
  })

  it('renders model · tokens · cost', () => {
    expect(formatAiRunDebug(mkRun())).toBe('Haiku · 9.6k tokens · ~$0.014')
  })

  it('formats sub-1000 token counts without the k suffix', () => {
    expect(formatAiRunDebug(mkRun({ total_tokens: 850 }))).toBe('Haiku · 850 tokens · ~$0.014')
  })

  it('uses 4 decimals for costs under a cent, 3 otherwise', () => {
    expect(formatAiRunDebug(mkRun({ estimated_cost_usd: 0.004 }))).toBe('Haiku · 9.6k tokens · ~$0.0040')
    expect(formatAiRunDebug(mkRun({ estimated_cost_usd: 0.123 }))).toBe('Haiku · 9.6k tokens · ~$0.123')
  })

  it('shows placeholders when tokens or cost are null', () => {
    expect(formatAiRunDebug(mkRun({ total_tokens: null, estimated_cost_usd: null }))).toBe('Haiku · ? tokens · ~$?')
  })
})
