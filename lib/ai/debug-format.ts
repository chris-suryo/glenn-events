import type { AiRun } from '@/lib/types'

// Dev-only AI cost debug line, gated by NEXT_PUBLIC_SHOW_AI_DEBUG. Never shown
// to normal users. See docs/AI_COST_AUDIT.md.

export function showAiDebug(): boolean {
  return process.env.NEXT_PUBLIC_SHOW_AI_DEBUG === 'true'
}

export function modelShortName(model: string | null): string {
  if (!model) return 'unknown'
  if (model.includes('haiku')) return 'Haiku'
  if (model.includes('sonnet')) return 'Sonnet'
  if (model.includes('opus')) return 'Opus'
  return model
}

function formatTokens(total: number | null): string {
  if (total === null) return '? tokens'
  if (total < 1000) return `${total} tokens`
  return `${(total / 1000).toFixed(1)}k tokens`
}

function formatCost(usd: number | null): string {
  if (usd === null) return '~$?'
  return `~$${usd.toFixed(usd < 0.01 ? 4 : 3)}`
}

// "Haiku · 9.6k tokens · ~$0.014" — model, tokens, cost. Caller appends the
// proposal count where it has one (Review cards do; Library cards don't).
export function formatAiRunDebug(aiRun: Pick<AiRun, 'model' | 'total_tokens' | 'estimated_cost_usd'> | null): string | null {
  if (!aiRun) return null
  return `${modelShortName(aiRun.model)} · ${formatTokens(aiRun.total_tokens)} · ${formatCost(aiRun.estimated_cost_usd)}`
}
