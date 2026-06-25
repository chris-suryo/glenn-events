# Glenn Events — Pilot-Readiness Audit & Trust Backlog

> **Status: living backlog (June 2026).** Condensed from a holistic read-only pilot-readiness
> audit. Companion to `PRODUCT_CHECKPOINT.md` (state), `M19_PRODUCT_DIRECTION.md` (IA/direction),
> `FRONTEND_DIRECTION.md` (visual). The app **is deployed** (on Vercel), so
> deployment-readiness is largely satisfied — verify env/migrations/bucket, don't rebuild.

## Verdict

**The brain is real; the front door isn't.** The core engine — extraction → Review gate →
provenance — is genuinely strong and is the asset to protect. The risk lives on the *edges*:
getting in (onboarding), and crossing the file→review bridge without it hanging, mis-targeting,
duplicating, or blanking the shell. **Safe to drive a scripted demo today; needs the pre-demo
fixes below before an unsupervised planner-friend session.**

## Top risks (by blast radius)

1. Empty Home/Command Center has **no composer** + hidden "Tell Glenn" — the planner lands with
   nowhere to start. `components/event/command-center.tsx`.
2. **File extraction is synchronous, no `maxDuration`** — the upload "hero moment" can freeze on
   "Reading…" / time out on Vercel. `app/api/events/[eventId]/files/route.ts`.
3. **Library "Review updates" opens the newest package, not the file's** — silent mis-apply /
   "my updates vanished." `components/event/file-library.tsx` → `chat-view.tsx`.
4. **No per-route `error.tsx`** — one transient error blanks the whole shell (only `app/global-error.tsx`).
5. **`timeline_item` & `decision` are never deduped** — re-uploading/re-typing a schedule
   duplicates the plan. `lib/ai/dedupe.ts` (~305–306, verified).
6. **Mock-mode silently fabricates** if `ANTHROPIC_API_KEY` is missing — the worst trust outcome
   in a live session. `lib/ai/mock-extract.ts`.
7. Migrations 009/010 + the `event-files` bucket are unverified at runtime — uploads fail silently if missing.
8. Seed doesn't stage the headline (image/library) loop — no instant magic moment.

## Pre-demo fixes — the `pilot-trust-hardening` branch (do now)

A tight **safety pass**, not a new phase. No visual redesign; no change to core
extraction/review/apply architecture except as required.

1. **Recoverable errors:** `app/(app)/error.tsx` (+ optional event-level) + `app/not-found.tsx` —
   in-shell, `reset()` + "Back to dashboard." Reserve `global-error.tsx` for root crashes.
2. **File extraction can't hang silently:** explicit `maxDuration` on `files/route.ts` and
   `extract-updates/route.ts`; a named "Glenn is reading {filename}…" state; named timeout/error +
   retry. Keep extraction synchronous (async is a later branch).
3. **Library → correct Review package:** thread `ai_run_id`/`source_message_id` so the matching
   `ReviewPackageCard` expands/scrolls — not index 0.
4. **Timeline/decision dedupe:** populate the `decision` + `timeline_item` branches in
   `lib/ai/dedupe.ts` from existing plan records (thread through `run-extraction.ts`); dedupe
   timeline on title + start clock-time; add a re-upload regression case to `scripts/test-extraction.ts`.
   **Status — June 2026 QA: REVERTED.** A title-only timeline dedupe was tried in `pilot-trust-hardening`
   then reverted: it wrongly dropped a legitimate time correction (existing "Guest arrival" 3:30 vs a new
   3:45 matched by title and was discarded as "already tracked"). Only exact duplicates (same title **and**
   start time) are safe to drop. Any re-attempt must be **correction-aware** — match on title + start
   clock-time, and treat a same-title item with a different time as a *correction*, never a duplicate.
   Decision dedupe also still deferred (needs `existing_decisions` in `EventStateContext`).
5. **Mock-mode guard:** require explicit `GLENN_USE_MOCK=true` (preferred) else fail clearly; a
   missing key must never silently fabricate; if mock runs, show an unmistakable banner.
6. **Preflight script:** `scripts/preflight.ts` — assert migration-011 columns, the files UPDATE
   policy, the `event-files` bucket, and required env; exit non-zero with a clear message.

*Optional if small:* bulk-apply confidence guard (exclude `confidence < 0.9` from package-level
"Apply N"; still individually applyable; no rich UI). Defer if invasive.

## Pre-pilot fixes (can wait — not friend-demo blockers)

Zero DB indexes (0 `CREATE INDEX` in 11 migrations, verified) + unbounded chat/Plan queries ·
concurrent double-approve duplicate row (no `UNIQUE(proposed_update_id)`; single-user safe today) ·
no approve/reject/RLS tests · cost-per-accepted-proposal never computed · `vendor_id` FK unused
(text "(Vendor reference: …)" suffix) · profiles-RLS self-only blocks teammate name resolution.

## What to protect (do NOT refactor in UI/token branches)

The extraction pipeline (shared text/PDF/image), **server-side re-validation of corrections**
(approve route refetches target by id + event_id), the Review package card's safe-by-default
Ready/Needs-answer/Removals structure, real provenance, honest failure handling (failed read →
`source_only`), the 24-check extraction regression harness, idempotency + optimistic lock on
approve, and RLS on all tables. **The trust model — source stays attached, nothing applies
silently, Review is the gate — is the product.**

## Locked branch sequence (June 2026)

0. `frontend-aesthetic-foundation` — tokens + typography (built; serif corrected to opt-in only).
1. **Docs-save** (this doc + IA direction).
2. **`pilot-trust-hardening`** — the pre-demo fixes above.
3. `onboarding-guided-setup` — mobile-first multi-step + Glenn interview + labeled starter framework.
4. `event-home-shell` — rename Command Center → Home / "Event Brief"; persistent Ask Glenn + Review badge/drawer.
5. `plan-unified` — Plan as one scrollable sectioned page (Run of Show first).
6. `files-merge` — Event Library + Activity → **Files**.
7. `frontend-source-artifact-kit` — real file thumbnails, exhibit/citation, animated drawer.
8. Wedding/planner scenario validation (below).

## Wedding / planner scenario validation (run before a planner friend)

On a **fresh event** ("Ava & Sam — Garden Wedding"), `NEXT_PUBLIC_SHOW_AI_DEBUG=true`, after
preflight:
1. Typed messy multi-fact note → expect ≥1 each of vendor/budget/task/timeline/open_question.
2. Apply the safe batch; answer one "needs your answer" inline → confirm Plan + provenance.
3. Upload a vendor PDF quote → time the "Reading…" wait; verify budget lines + source receipt.
4. Upload a screenshot → verify it reads or **degrades to an open question** (no invention).
5. **Re-upload the same PDF → does timeline/budget duplicate?** (the dedupe prediction — the single
   most important thing to confirm.)
6. Correction ("florist dropped to $2,000") → diff, no duplicate.
7. Cancellation/replacement → deliberate removal + new vendor.
8. Click a fact → provenance drawer (source → proposal → diff → approver).
9. Activity → grouped "uploaded → proposed N → applied X" narrative.
10. Return-visit → Home reflects reality.

**Scorecard (per source type):** proposals · accepted · accept-rate · $/run · $/accepted-proposal ·
any hallucination · any duplicate. **Pass bar:** zero fabricated facts, zero duplicates on
re-upload, accept-rate ≥ ~70% on typed notes, upload never hangs >~15s without a state. Record in
`docs/AI_COST_AUDIT.md`.
