// Approximate Anthropic pricing for dev-mode AI cost telemetry, in USD per 1M
// tokens. VERIFY against current Anthropic pricing before relying on these
// numbers — see docs/AI_COST_AUDIT.md. An unknown model yields null (a visible
// "~$?" in the debug line) rather than a confidently wrong figure.
//
// Verified 2026-06 against the claude-api reference:
//   claude-haiku-4-5  — $1 in / $5 out per 1M
//   claude-sonnet-4-6 — $3 in / $15 out per 1M

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

interface ModelPrice {
  inputPer1M: number
  outputPer1M: number
}

const PRICING: Record<string, ModelPrice> = {
  'claude-haiku-4-5': { inputPer1M: 1, outputPer1M: 5 },
  'claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15 },
}

export function estimateCostUsd(model: string, usage: TokenUsage | null | undefined): number | null {
  if (!usage) return null
  const price = PRICING[model]
  if (!price) {
    console.warn(`pricing: no rate for model "${model}" — cost estimate unavailable`)
    return null
  }
  const input = usage.input_tokens ?? 0
  const output = usage.output_tokens ?? 0
  const cost = (input / 1_000_000) * price.inputPer1M + (output / 1_000_000) * price.outputPer1M
  return Math.round(cost * 1e6) / 1e6
}
