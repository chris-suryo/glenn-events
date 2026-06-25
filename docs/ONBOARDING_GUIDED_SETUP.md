# Glenn Events — Guided Onboarding Setup (Plan of Record)

> **Status:** Implementation plan for branch `onboarding-guided-setup` (off `pilot-trust-hardening`).
> Locked 2026-06-17 (revised same day after a flow-refinement pass). This doc is the agreed plan;
> implementation follows it in small checkpoints.
> Read alongside `docs/M19_PRODUCT_DIRECTION.md` (IA/onboarding direction), `docs/PILOT_READINESS_AUDIT.md`
> (this is the audit's #1 front-door fix), `docs/PRODUCT_SOUL.md` (north star), and `CLAUDE.md` (architecture).

---

## 1. Goal

Replace the cold static create-form and the dead-end empty Command Center with a **sleek, mobile-first
guided setup** (one question per screen) that ends in a **clearly-labeled, editable starter plan the user
reviews before anything enters the Plan.**

This is the audit's top pilot blocker: *"the brain is real; the front door isn't."* A new planner today
lands on `/events/new` (a desktop form) and then on an empty Command Center whose only affordance is a
link to `/chat`. Guided onboarding fixes the front door **without weakening the trust model** — the
starter plan is a normal pending Review batch the user explicitly applies, not a silent write.

**North star for this branch:** *truly easy, simple, streamlined, self-explanatory.* Bias every choice
toward fewest taps and zero jargon.

**Non-goal for this branch:** the Home/"Event Brief" redesign, persistent global Ask Glenn, the persistent
Review drawer, and the Files merge. Those are later branches (`event-home-shell`, `plan-unified`,
`files-merge`). This branch is *only* the front door.

---

## 2. Locked decisions

From the 2026-06-17 planning exchange (all approved):

| # | Decision |
|---|---|
| 1 | Branch from `pilot-trust-hardening`. Keep stacking **for this branch only**; reassess integration/PR strategy after onboarding. |
| 2 | Starter draft = **`runExtraction` → pending Review batch**. **Never auto-apply.** No dedicated seeder. No Review-gate exception. |
| 3 | Per-event depth = **structured steps + one free-text "what you already know" capture.** No multi-turn Glenn interview in v1. |
| 4 | Land on **today's `/events/[id]` Command Center** (reached *after* the starter-review step). Add an **inline composer** to its empty state. |
| 5 | **Do not** rename nav to Home, build Event Brief, or build the persistent Review drawer in this branch. |
| 6 | **Do not** touch extraction internals, approve/reject/provenance, `dedupe.ts`, or the M22 file pipeline. |
| 7 | **Field order:** Event name → Type → Date & time → Location → Guest count → What you already know. Name is its own first step, **typed/editable**. |
| 8 | **One-question-per-screen stepper** (Typeform-style), mobile-first; optional steps skippable; progress + back nav. |
| 9 | **Account-level one-time question** ("what kinds of events does your team usually run?"), stored on **`profiles`** (additive migration); personalizes the type bubbles + pre-selects the likely type from event #1. |
| 10 | **Dedicated focused starter-review step** that reuses the real `ReviewPackageCard` — **not** the full `/chat` Review tab on first run. Apply → Command Center; Skip → Command Center (batch stays pending). |
| 11 | **Create-at-the-end:** the event row is inserted once, at submit (after the capture step). Abandoning mid-flow leaves **no orphan event**. |

The trust model is sacred: **nothing applies to the Plan without Review.** The starter plan is reviewed
and applied by the user exactly like any other batch — there is **no** special exception in v1.

---

## 3. User flow

Mobile-first, **one decision per screen**, large tap targets, optional steps skippable, selecting a bubble
auto-advances, progress dots + back navigation.

**First-ever event:**

0. **What do you usually run?** *(one-time)* — multi-select bubbles over the event taxonomy. Saved to the
   user's `profiles` row. Shown only when the preference is unset; remembered + skipped thereafter.
1. **Event name** — typed, required. (Pre-fillable from the chosen type later, but name comes first.)
2. **Type** — selectable bubbles, **ordered by + pre-selecting** the account preference from step 0.
3. **Date & time** — date input (`event_date`). Skippable.
4. **Location** — text, "if known" (`location`). Skippable.
5. **Guest count** — number (`attendee_target`). Skippable.
6. **What you already know** — one free-text capture (the extraction signal). Skippable.
7. **"Glenn is drafting your starter plan…"** — event is created, then extraction runs.
8. **Starter-review step** — a calm, focused single-card screen ("Here's the starter plan Glenn drafted
   from your answers"), reusing `ReviewPackageCard` with an **"Apply starter plan"** CTA + "Skip for now."
9. **Land on `/events/[id]`** (Command Center) — populated if applied; otherwise the getting-started state
   with the inline composer.

**Later events:** identical, **skipping step 0**.

**Quick-create escape hatch:** a small "just name it" path → straight to the event, bypassing the stepper
(and step 0), for power users.

---

## 4. Account-level onboarding (event-type preference)

- **What it asks:** one screen — *"What kinds of events does your team usually run?"* — multi-select over
  the same taxonomy. One quick question; a typical-guest-count pre-fill can be added later.
- **When:** inlined as **step 0 of the first guided setup**, shown only while the preference is unset,
  then remembered and skipped. No separate welcome route to maintain.
- **What it does:** selected types **float to the top of the type bubbles** and the most likely one is
  **pre-selected** on event #1 — a wedding planner never wades through corporate options.
- **Storage:** a new **additive** column on `profiles` (e.g. `typical_event_types text[]`, nullable).
  Per-user. The `profiles` row always exists (the create flow upserts it), so there is no org-creation
  timing problem and personalization works from the very first event.
- **Migration:** the next-in-sequence migration (verify the number against `supabase/migrations/` at build
  time; ~012). Manual-apply convention (like 008/009/010/011). Additive + reversible.

> The event-type bubbles are quick-pick shortcuts over a **free-text** `event_type` column, with an
> "Other (type your own)" option — so the taxonomy is pure UX convenience and can change anytime.
> **Proposed starter set:** Client / corporate dinner · Conference · Networking / mixer · Fundraiser /
> gala · Product launch · Workshop · Offsite / retreat · Wedding · Other.

---

## 5. Route / API design

### 5.1 `POST /api/events/onboard` (new)

Authenticated user context + RLS only. **No service role.** Mirrors the auth/ownership model of the
existing `POST /api/events`.

**Request body (Zod-validated):**

```
{
  name:            string   // required (typed)
  event_type?:     string
  event_date?:     string
  location?:       string
  attendee_target?: number
  budget_target?:  number
  capture?:        string   // the free-text "what you already know"
}
```

**Behavior:**

1. Auth check (session user). Unauthenticated → 401.
2. **Create the event first** via a shared create helper (extracted from the existing `/api/events`
   route: ensure profile → ensure org/membership → insert event → insert `event_members` owner). If create
   fails → return the error; **nothing else happens** (no partial state).
3. Build the extraction input: prefer `capture`; if empty, synthesize a minimal prompt from the card
   fields (e.g. *"Setting up a corporate dinner for 85 guests on Sep 27 in Boston. Draft an initial
   plan."*). Event metadata already rides into the extraction context (the event was just created with
   those fields), so the capture is the primary extraction signal — this avoids redundant proposals like
   "task: 85 guests."
4. **Best-effort** `runExtraction({ supabase, eventId, userId, inputText, channel: 'onboarding' })`,
   wrapped so neither a `{ ok: false }` result nor a thrown error is fatal.
5. Return `{ id, draft }` where `draft` ∈ `'ready' | 'empty' | 'skipped'` (+ `ai_run_id`/`proposed_count`
   when ready, used to route into the starter-review step).

The account preference (step 0) is written separately — a small profile upsert before/at the start of the
flow — and the type step reads `profiles.typical_event_types` to order/pre-select bubbles.

### 5.2 Why a dedicated route (vs. two client calls)

Keeps the general chat extract path (`/api/events/[id]/extract-updates`) free of any onboarding concept,
and centralizes best-effort handling + the single "creating + drafting" loading state server-side. The
event-create logic is factored into a shared helper so `/api/events` and `/api/events/onboard` don't
duplicate the profile/org bootstrap.

### 5.3 `channel: 'onboarding'`

`runExtraction` already accepts a `channel` param (files pass `'file'`), so **no change to
`run-extraction.ts` is expected.** The intake message is written with `channel: 'onboarding'`, which is the
signal the Review layer uses to label the package (see §6).

> **OPEN — verify before relying on it:** `messages.channel` was added in migration 009. If it carries a
> CHECK constraint that restricts allowed values, `'onboarding'` may require an additive migration.
> **Per the guardrails, STOP and ASK before any such schema/constraint change** — do not silently add a
> migration. If unconstrained (free text), no migration is needed.

---

## 6. Starter-review step + package behavior

The starter proposals land as a **normal pending `ai_run` batch** — identical plumbing to a typed note.
Nothing is auto-applied; the Plan stays empty until the user applies.

The first run shows them in a **dedicated, focused step** — *not* the full `/chat` Review tab:

- A lightweight server-rendered surface (reached right after drafting) loads the event's pending proposals
  and renders **one** `ReviewPackageCard` (reused) in a calm single-card frame — no chat thread, no batch
  history.
- **`lib/review.ts`** — when a package's source message has `channel: 'onboarding'`, give it the title
  **"Starter draft from setup"** and the lead copy *"Glenn drafted a starter plan from your setup answers.
  Review and apply it to start."*
- **`components/event/review-package-card.tsx`** — for that package, render the starter label + copy and a
  primary CTA reading **"Apply starter plan"** (this is the existing package-level apply, relabeled — it
  fans out to `/api/updates/[id]/approve` exactly as today). A secondary **"Skip for now"** routes to the
  Command Center, leaving the batch pending (discoverable in `/chat` Review).
- The safe-by-default **Ready / Needs-answer / Removals** structure is **untouched**. Removals still
  require deliberate per-row action; needs-answer still uses the clarify flow.

**Apply → `/events/[id]` (Command Center, populated).** **Skip → `/events/[id]` (empty + inline composer).**

**Provenance:** applied starter records trace back to the onboarding intake `messages` row and its
`ai_run` — a real receipt, the same as any other reviewed change. The normal `/chat` Review tab remains the
home for all *subsequent* updates (and for this batch if skipped).

---

## 7. Landing behavior (Command Center, v1)

Embed `<GlennInput variant="plain">` in the Command Center's **getting-started / empty** state (replacing
the bare `/chat` link), so the landing is never a dead end. `GlennInput` is already built for this — it
exposes a `placeholder` override commented *"e.g. for empty-event onboarding"* and a `variant="plain"`.

- **After applying the starter plan:** records exist → the populated layout renders normally.
- **After skipping / degraded (no draft):** `planIsEmpty` is true → the getting-started state renders with
  the **inline composer** — the user can immediately tell Glenn what they know.

The always-present (populated-state) inline composer is deferred to `event-home-shell`.

---

## 8. Failure / degraded path

| Situation | Outcome |
|---|---|
| Account preference write fails | Non-fatal; continue the flow with the static bubble set. |
| Event create fails | API returns error; wizard shows it; **nothing created** (no partial state). |
| Create OK, extraction 503 (no `ANTHROPIC_API_KEY`, no `GLENN_USE_MOCK`) | **Event still created.** The mock-fabrication guard (a123c78) deletes the intake message and creates **no** proposals — **zero fabricated records.** `draft: 'skipped'`. The starter-review step is skipped; user lands on the getting-started state + inline composer. |
| Create OK, extraction throws | Same as above — swallowed, `draft: 'skipped'`, clean landing. |
| Create OK, extraction returns 0 proposals | `draft: 'empty'`. Starter-review step skipped; clean landing; optional subtle "tell Glenn more" hint. |
| Create OK, extraction succeeds | `draft: 'ready'`. Route into the starter-review step. |

The degraded path is the most important trust property: **a missing key never produces invented data** —
it produces an event with an empty, honest, ready-to-use workspace.

In production (Vercel, key set) the real loop runs and the draft is genuine.
`maxDuration=60` already exists on the extract route (a123c78), so the draft step won't time out on Vercel.

---

## 9. Files likely touched

| File | Change |
|---|---|
| `supabase/migrations/0XX_*.sql` (new) | Additive `profiles.typical_event_types text[]`. |
| `lib/types/index.ts` | Add `typical_event_types` to the profile type. |
| `app/(app)/events/new/page.tsx` | Replace static form with the mobile-first **stepper**; keep a small name-only quick-create escape hatch. |
| `components/event/onboarding/*` (new) | Stepper shell + step components (account-pref step, name, type bubbles, date, location, guests, capture, "Glenn is drafting" state). |
| `app/api/events/onboard/route.ts` (new) | Create event (shared helper) → best-effort `runExtraction` with `channel: 'onboarding'`. |
| `lib/events/create-event.ts` (new) or shared helper | Factor profile/org/event/member bootstrap out of `/api/events`. |
| `app/(app)/events/[eventId]/start/page.tsx` (new) or similar | Focused starter-review surface that loads the pending batch + renders the reused card. |
| `lib/review.ts` | Onboarding-channel package label + lead copy. |
| `components/event/review-package-card.tsx` | Starter label/copy + "Apply starter plan"/"Skip for now" (presentation only). |
| `components/event/command-center.tsx` | Inline `GlennInput` in the getting-started/empty state. |

`run-extraction.ts` is expected to need **no change** (`channel` is already a param).

---

## 10. What NOT to touch

- Extraction internals (`lib/ai/llm-extract.ts`, `mock-extract.ts`, prompt logic), `lib/ai/dedupe.ts`.
- The approve / reject / provenance routes and the provenance drawer.
- The M22 file pipeline (`files/route.ts`, `file-library.tsx`, `attach-button.tsx`, upload path).
- The Review card's safe-by-default Ready / Needs-answer / Removals decision structure (add label/CTA
  only).
- **No** auto-apply, **no** seeder, **no** Review-gate exception.
- **No** nav rename to Home, **no** Event Brief layout, **no** persistent/global Review drawer, **no**
  Files merge.
- **No** schema change beyond the approved additive `profiles` column without stopping to ask first
  (this includes the `messages.channel` constraint check).

---

## 11. Acceptance criteria

- **Account onboarding:** on a brand-new user, step 0 appears once, multi-select persists to `profiles`,
  and on the next event it is skipped while the type bubbles reflect the saved preference.
- Guided **stepper** completes on a **390px** viewport (name → type → date → location → guests → capture).
- The event row is created with the typed name + card fields; abandoning mid-flow creates **no event**.
- Glenn produces a **pending** starter Review package from the user's own words, shown in the **dedicated
  starter-review step**, clearly labeled "Starter draft from setup," with provenance to the intake message.
- **The Plan is empty before applying.** Nothing is auto-written.
- **"Apply starter plan"** populates the Plan (existing apply path) → lands on Command Center.
- **"Skip for now"** lands on Command Center with the batch still pending (visible in `/chat` Review).
- A **follow-up** note from the landing composer goes through the **normal** Review flow (not auto-applied).
- **No-key / 503 path** creates the event, skips the review step, and **does not fabricate** any records.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` all pass.

---

## 12. Manual QA plan

On a **fresh user / event** "Ava & Sam — Garden Wedding," 390px viewport, `NEXT_PUBLIC_SHOW_AI_DEBUG=true`:

1. **Account step:** verify step 0 appears, multi-select saves to `profiles`, and a *second* event skips it
   with bubbles reordered/pre-selected from the saved preference.
2. Run the guided stepper end-to-end → verify the event row fields (name/type/date/location/guests).
3. Verify the **dedicated starter-review step** appears with a **labeled** package ("Starter draft from
   setup").
4. Verify the **Plan is empty** before applying (every tab, no records).
5. Tap **"Apply starter plan"** → Plan populates; lands on Command Center; provenance on a record traces
   back to the onboarding intake message.
6. Re-run; on the review step tap **"Skip for now"** → lands on Command Center, batch still pending in
   `/chat`.
7. From the landing **inline composer**, send a follow-up note → confirm it produces a **new** normal
   Review batch (not auto-applied).
8. **Degraded path:** simulate a 503 (unset `ANTHROPIC_API_KEY` locally, no `GLENN_USE_MOCK`) → run setup →
   confirm the event is created, the review step is skipped, the landing is usable, and **zero** records/
   proposals were fabricated.
9. Confirm the quick-create escape hatch still works (name only → event).

---

## 13. Risks & rollback

**Risks**

- **Thin-input draft quality** — a sparse capture yields a thin draft. Mitigate: capture-as-primary-signal
  + a strong "Glenn is drafting…" state; validate quality in QA. (A thin but honest draft is acceptable.)
- **Degraded mode** — must create the event and land cleanly with no fabrication. Covered by best-effort
  extraction + the a123c78 guard; explicitly tested (QA #8).
- **`messages.channel` constraint** — may need an additive migration. **Stop and ask first** (guardrail).
- **Scope** — this branch grew to include account-level onboarding + a migration. Sequenced as discrete
  checkpoints; can split the account piece into a fast-follow branch if it bloats the diff.
- **Stepper friction** — more screens than a single form; mitigate with skippable optional steps,
  auto-advance on bubble select, and progress/back affordances.
- **New mobile wizard surface** — reuse existing tokens/components; no new UI framework.

**Rollback**

- Stacked feature branch; rollback is branch-level (`git branch -D onboarding-guided-setup` / don't merge).
- The only schema change is the **additive** `profiles.typical_event_types` column — reversible, no data
  loss. No destructive changes are planned.
- All touched product flows (extraction, review, apply, provenance) are reused, not forked — so reverting
  the branch fully restores prior behavior.

---

## 14. Implementation checkpoints

1. **This commit** — revised planning doc (plan of record) only.
2. **Migration** — additive `profiles.typical_event_types` + type update (manual-apply convention).
3. **Shared create helper + `POST /api/events/onboard`** (create → best-effort extraction, channel
   `'onboarding'`); verify the `messages.channel` constraint (stop-and-ask if it needs a migration).
4. **Guided stepper UI** replacing `/events/new` (incl. one-time account step + quick-create escape hatch).
5. **Dedicated starter-review step** + onboarding label + "Apply starter plan"/"Skip for now".
6. **Inline composer** on the Command Center empty state.
7. **Manual QA** (§12) + typecheck/lint/build → report. **No push** without approval.

---

*End of plan. Implementation happens on `onboarding-guided-setup`; this file is the plan of record.*
