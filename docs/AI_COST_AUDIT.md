# Glenn Events — AI Cost Audit Playbook

Lightweight cost/usage visibility for extraction runs. This is a **dev/debug
audit aid**, not a billing system, quota engine, or customer-facing dashboard.

The telemetry described here is **live as of M22**
(`m22-image-extraction-with-ai-debug`, head `96f38bc`): migration 011 + usage
plumbing + the dev debug line all shipped. This doc is the spec + the place to
record results.

> **Pricing must stay verified.** The rates below were verified 2026-06 against
> the `claude-api` reference and are hard-coded in `lib/ai/pricing.ts`. Re-verify
> against current Anthropic pricing when models or rates change. An unknown model
> yields `~$?` (null), never a confidently wrong figure.

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

## Pricing Table (verified 2026-06)

USD per 1M tokens. Mirrors `lib/ai/pricing.ts`.

| Model | Input / 1M | Output / 1M | Verified? |
|---|---|---|---|
| `claude-haiku-4-5` | $1.00 | $5.00 | ✅ |
| `claude-sonnet-4-6` | $3.00 | $15.00 | ✅ |

Extraction defaults to `claude-haiku-4-5` (`DEFAULT_EXTRACT_MODEL`); attachments
may override via `ANTHROPIC_FILE_EXTRACT_MODEL`.

Cost formula:
`estimated_cost_usd = (input_tokens/1e6)*inputPer1M + (output_tokens/1e6)*outputPer1M`

Pricing lives in one place — `lib/ai/pricing.ts` — keyed by model id, so a rate
change is a one-line edit. Unknown model → `null` + `console.warn`.

---

## Observed Results — M22 Manual QA (2026-06)

Read off the dev debug line with `NEXT_PUBLIC_SHOW_AI_DEBUG=true`. All on
`claude-haiku-4-5`. (in/out token split, duration, and accepted-count not
captured in this pass — recorded as totals.)

| # | Source type | Note | Model | Total tok | ~Cost USD | Proposals |
|---|---|---|---|---|---|---|
| 1 | image | Screenshot | Haiku | 10.3k | ~$0.014 | 4 |
| 2 | image/pdf | Beacon (PDF screenshot-style) | Haiku | 12.2k | ~$0.020 | 7 |
| 3 | pdf | Beacon PDF | Haiku | 11.6k | ~$0.019 | 8 |

Early read: a screenshot/PDF extraction on Haiku lands around **~$0.01–0.02 per
run** at ~10–12k tokens. Cost-per-accepted-proposal awaits a run where accepted
counts are tracked (wedding scenario, below).

---

## Test Results Template

Fill one row per extraction run during the wedding scenario. Read
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
