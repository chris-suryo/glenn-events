# Glenn Events — AI Cost Audit Playbook

Lightweight cost/usage visibility for extraction runs. This is a **dev/debug
audit aid**, not a billing system, quota engine, or customer-facing dashboard.

The telemetry described here is **planned for M22**
(`m22-image-extraction-with-ai-debug`); this doc is the spec + the place to
record results. It will become live once migration 011 + usage plumbing land.

> **Pricing must be verified before it is hard-coded.** The rates in the table
> below are placeholders. Confirm current Anthropic per-token pricing (via the
> `claude-api` skill / Anthropic pricing docs) before committing real numbers to
> `lib/ai/pricing.ts`. An unknown/unverified model should yield `~$?`, never a
> confidently wrong figure.

---

## What AI Run Telemetry Will Track

Captured per extraction run and persisted on `ai_runs` (migration 011, additive
nullable columns — write-once, 1:1 with the run):

| Field | Source | Notes |
|---|---|---|
| `model` | resolved model id | e.g. `claude-haiku-4-5` |
| `provider` | constant | `anthropic` for now |
| `source_type` | `attachment?.kind` / channel | `text` \| `pdf` \| `image` |
| `input_tokens` | `response.usage.input_tokens` | from Anthropic SDK |
| `output_tokens` | `response.usage.output_tokens` | from Anthropic SDK |
| `total_tokens` | input + output (+ cache if present) | |
| `estimated_cost_usd` | `estimateCostUsd(model, usage)` | `null` on unknown model |
| `duration_ms` | wall-clock around the LLM call | |

**Derived, not stored:**
- `proposal_count` = `count(proposed_updates where ai_run_id = …)`
- `accepted_count` / `applied_count` = same, filtered by
  `status in ('approved','applied')`

Mock-mode runs (no API key) leave all telemetry columns null — that is expected,
not a failure.

---

## Placeholder Pricing Table (VERIFY BEFORE USE)

USD per 1M tokens. **Unverified — placeholders only.**

| Model | Input / 1M | Output / 1M | Verified? |
|---|---|---|---|
| `claude-haiku-4-5` | $TBD | $TBD | ☐ |
| `claude-sonnet-4-6` | $TBD | $TBD | ☐ |

Cost formula:
`estimated_cost_usd = (input_tokens/1e6)*inputPer1M + (output_tokens/1e6)*outputPer1M`

Pricing lives in one place — `lib/ai/pricing.ts` — keyed by model id, so a rate
change is a one-line edit. Unknown model → `null` + `console.warn`.

---

## Test Results Template

Fill one row per extraction run during M22 QA and the wedding scenario. Read
`model`/tokens/cost/`duration_ms` off the debug line (with
`NEXT_PUBLIC_SHOW_AI_DEBUG=true`) or directly from `ai_runs`.

| # | Source type | File / note | Model | In tok | Out tok | Total | ~Cost USD | Duration ms | Proposals | Accepted | Notes (quality / over-extraction) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | pdf | Beacon quote | | | | | | | | | |
| 2 | image | text-msg screenshot | | | | | | | | | |
| 3 | image | vendor quote screenshot | | | | | | | | | |
| 4 | image | menu screenshot | | | | | | | | | |
| 5 | text | typed note | | | | | | | | | |

---

## Headline Metrics

Compute after a test batch:

- **Cost per run** = `estimated_cost_usd` (mean and max across runs).
- **Cost per accepted proposal** = `sum(estimated_cost_usd) / sum(accepted_count)`.
  This is the metric that matters — it prices the *useful* output, not raw runs.
- **Cost by source type** = group the above by `source_type`. Expectation:
  `image` > `pdf` > `text` (vision tokens are heavier — the reason telemetry
  ships before bulk screenshot testing).
- **Over-extraction signal** = proposals generated vs. accepted; a low
  acceptance ratio on screenshots flags prompt tightening.

Aggregate queries (post-M22), e.g.:
`select source_type, count(*), avg(estimated_cost_usd), sum(total_tokens)
 from ai_runs where event_id = $1 group by source_type;`

---

## Non-Goals

Billing, quotas, Stripe, customer-facing analytics, a full cost dashboard, and
event-level cost rollups in the UI are all out of scope. The only UI is a
muted dev-only debug line gated behind `NEXT_PUBLIC_SHOW_AI_DEBUG`.
