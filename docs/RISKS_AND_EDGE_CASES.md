# Glenn Events — Risks & Edge Cases (supervised-session backlog)

> A prioritized, living backlog of known risks, latent bugs, and edge cases that need a
> **supervised** session (real-LLM validation, or a change big enough to warrant eyes-on). Pure
> mechanical hardening that's safe to do unattended goes straight to a branch; this file is for the
> things that shouldn't be done blind. Companion to `SYSTEM_CAPABILITIES.md` (what's built) and
> `TEST_SCENARIOS.md` (how we validate).
>
> **Method.** Items are ranked P1 (highest) → P5. Each has: the problem, the trigger, current
> mitigation (if any), and the recommended fix + why it needs supervision.

## P1 — Large-event event-state truncation → correction/dedupe misses
**Problem.** Every extraction sends Glenn a snapshot of the current plan so it can target
corrections and avoid duplicates. That snapshot is **newest-first and capped**
(`lib/ai/run-extraction.ts`): vendors **10**, budget items **10**, timeline **20**, tasks **15**,
pending proposals 50, chat history 10. On a large event (a real gala/wedding easily exceeds 10–20
vendors and a 30+ item run-of-show), **older records fall out of the snapshot**, so a correction to
an old record can't find its target and Glenn proposes a **duplicate** instead of an update.
**Trigger.** Event with >10 vendors or >10 budget lines; then correct an *older* one ("the caterer
is now $90/head"). Worsens as the event grows — the opposite of what you want.
**Current mitigation.** None. (App-side `dedupeExtractedItems` also only dedupes against the same
capped set.)
**Recommended fix (supervised — changes extraction behavior).** Replace "newest-N" with
**relevance-based retrieval**: match the incoming note's text against *all* vendor/budget/timeline
names + categories and include the top matches, plus a compact one-line index of the rest, within a
token budget. Add a guardrail: when a correction can't resolve a target, Glenn **asks** ("I don't
see an existing caterer line — new, or did you mean X?") rather than silently duplicating. **Needs
real-LLM validation** (recall/precision of the matcher) + the 5-event lifecycle suite — do not do
unattended.

## P2 — `formatDate` ignores the event timezone for timestamptz preview rows
**Problem.** `lib/review.ts` `formatDate()` formats a *timestamptz* via `new Date(value)` +
`toLocaleDateString` with **no `timeZone`** — so a proposal-row date preview uses the *host* zone,
not the event's. Date-**only** values are now safe (fixed: parsed from local components). The
canonical Plan/Run-of-Show display already goes through `parseTimelineDateValue(value, timeZone)`
and is correct; this only affects the pre-approval Review-row *preview* text.
**Trigger.** A late-evening timed item (e.g. 23:30Z) whose UTC calendar day differs from the event
zone's, shown in a Review row before approval.
**Current mitigation.** Vercel runs UTC and most events are US-Eastern, so it's usually right;
canonical display is always correct. Low user impact.
**Recommended fix (small, but verify visually).** Thread the event `timeZone` into the Review-row
date preview (or reuse `formatTimelineDateTime`/`parseTimelineDateValue`). Safe, but touches several
call sites in `getUpdateDetail`/`getTimelineDisplay` — worth a screenshot pass.

## P3 — `event_detail` approve: concurrent double-patch of the events row
**Problem.** The `event_detail` branch in `app/api/updates/[id]/approve/route.ts` patches the
`events` row **before** claiming the optimistic lock on the proposal. Two simultaneous approves
(two tabs) can both patch `events` and both write an `activity_log` row.
**Current mitigation (shipped).** The branch now verifies the lock claim (`.select('id')` + warn on
0 rows) — so a concurrent approve is **detected/logged**. The double-patch is idempotent (same
non-null fields → same result), so harm is limited to a duplicate activity entry.
**Recommended fix (supervised — reorders a mutation).** Claim the lock *first* (update
proposed_updates `…eq('status','pending').select()`); only patch `events` if a row was claimed. Low
risk but it changes the approve ordering — review before shipping.

## P4 — No database indexes
**Problem.** No indexes exist on any table. Per-event filters (`event_id`), `order by starts_at/
created_at`, and `status` filters are unindexed. Fine at demo scale; degrades as events/records grow.
**Recommended fix (migration — supervised).** Add indexes on the hot paths: `proposed_updates(event_id,
status)`, `(ai_run_id)`; `*_items(event_id, archived_at)`; `timeline_items(event_id, starts_at)`;
`activity_log(event_id, created_at)`. A new `supabase/migrations/NNN_indexes.sql` + a `DEPLOYMENT.md`
entry; owner-applied. Mechanical but it's a schema change → supervised.

## P5 — Single-user only (no invite/collaboration flow)
**Problem.** Multi-user is seed/bootstrap only; there's no member-invite flow. An agency runs events
with several planners (concurrent edits, who-approved-what). Provenance + `activity_log` exist, but
there's no way to add a teammate to an event from the UI.
**Recommended fix (feature — supervised).** Invite flow (email or link) + `event_members` UI. Larger
build; product decision. Tracked in `FUTURE_STATE_PRODUCT_PLAN.md` territory.

---

## Documented intentional behaviors (not bugs — recorded so they aren't "fixed" by mistake)
- **`event_detail` bypasses the confidence gate.** In `buildReviewPackages`, event-level facts always
  land in the `eventDetails` partition regardless of `needsCheck` — they're high-stakes and always get
  explicit one-at-a-time review, never the low-confidence "needs answer" bucket.
- **Optimistic Review state relies on React keying + rollback.** `appliedIds`/`dismissedIds` live in
  `ReviewPackageCard`, which is keyed by `pkg.aiRunId` (so each package has isolated state and a fresh
  mount). Applied/rejected rows drop from the pending set on `router.refresh()`; a failed mutation rolls
  the optimistic mark back. *Stale* bulk items are intentionally **not** rolled back (they vanish on
  refresh — rolling back would flicker them back as pending).
- **Catering/headcount math is explicit-only.** Changing the guest count does not silently re-math an
  approved catering budget line; the user re-tells Glenn ("recompute for 100"). Avoids silent money
  changes. (If we ever want proactive "your catering line is still at 90 guests" nudges, that's a
  feature, not a fix.)

## Test coverage — status & gaps
**Now covered (vitest, offline, `npm test`):** `lib/timeline-format.ts` (tz wall-clock, date-only,
midnight, ranges), `lib/utils.ts` `formatEventDateTime`/`formatDistanceToNow`, `lib/review.ts`
(formatters, `getUpdateName/Detail`, `getEventDetailChanges`, `getStructuredFields`, partitioning,
predicates), `lib/ai/dedupe.ts` (intra-batch + against-plan dedup). 43 tests.
**Gaps (supervised / needs setup):**
- **Component/interaction tests** for `ReviewPackageCard` (optimistic apply/dismiss, group collapse,
  event-detail solo approve) — needs jsdom + React Testing Library; deferred (heavier setup, and the
  logic is largely exercised through the live test scenarios).
- **API route tests** for approve/reject (optimistic lock, event_detail patch, RLS) — needs a Supabase
  test harness/mocks; deferred.
- **`groupByComponent`** lives in `components/event/review-package-card.tsx` (not exported); lifting it
  to `lib/review.ts` would make it unit-testable — small, do alongside the next Review change.
- **`lib/ai/run-extraction.ts` reconcile/correction-target** logic is only covered end-to-end via the
  live scenarios; pure-extractable pieces could get unit tests.
