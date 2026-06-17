# Glenn Events — Guided Onboarding Setup (Plan of Record)

> **Status:** Implementation plan for branch `onboarding-guided-setup` (off `pilot-trust-hardening`).
> Locked 2026-06-17. This doc is the agreed plan; implementation follows it in small checkpoints.
> Read alongside `docs/M19_PRODUCT_DIRECTION.md` (IA/onboarding direction), `docs/PILOT_READINESS_AUDIT.md`
> (this is the audit's #1 front-door fix), `docs/PRODUCT_SOUL.md` (north star), and `CLAUDE.md` (architecture).

---

## 1. Goal

Replace the cold static create-form and the dead-end empty Command Center with a **sleek, mobile-first
guided setup** that ends in a **clearly-labeled, editable starter plan the user reviews before anything
enters the Plan.**

This is the audit's top pilot blocker: *"the brain is real; the front door isn't."* A new planner today
lands on `/events/new` (a desktop form) and then on an empty Command Center whose only affordance is a
link to `/chat`. Guided onboarding fixes the front door **without weakening the trust model** — the
starter plan is a normal pending Review batch, not a silent write.

**Non-goal for this branch:** the Home/"Event Brief" redesign, persistent global Ask Glenn, the persistent
Review drawer, and the Files merge. Those are later branches (`event-home-shell`, `plan-unified`,
`files-merge`). This branch is *only* the front door: guided creation → starter Review package → a usable
landing.

---

## 2. Locked decisions

From the 2026-06-17 planning exchange (all approved):

| # | Decision |
|---|---|
| 1 | Branch from `pilot-trust-hardening`. Keep stacking **for this branch only**; reassess integration/PR strategy after onboarding. |
| 2 | Starter draft = **`runExtraction` → pending Review batch**. **Never auto-apply.** No dedicated seeder. No Review-gate exception. |
| 3 | Interaction depth = **cards + one free-text "what you already know" capture.** No multi-turn Glenn interview in v1. |
| 4 | Land on **today's `/events/[id]` Command Center**. Add an **inline composer** there *if small and directly supporting the onboarding landing.* |
| 5 | **Do not** rename nav to Home, build Event Brief, or build the persistent Review drawer in this branch. |
| 6 | **Do not** touch extraction internals, approve/reject/provenance, `dedupe.ts`, or the M22 file pipeline. |

The trust model is sacred: **nothing applies to the Plan without Review.** The starter plan is reviewed
and applied by the user exactly like any other batch — there is **no** special exception in v1.

---

## 3. User flow

Mobile-first, one decision per screen, large tap targets:

1. **Event type** — selectable cards/bubbles (Corporate dinner, Conference, Wedding, Fundraiser, Launch,
   Meetup, Workshop, Offsite, Other). Selection pre-fills an editable **event name** (e.g. "Corporate
   Dinner"); the user can rename (e.g. "Ava & Sam — Garden Wedding").
2. **Guest count** — number (maps to `attendee_target`). Skippable.
3. **Date / time** — date input (maps to `event_date`). Skippable.
4. **Location** — text, "if known" (maps to `location`). Skippable.
5. **What you already know** — one free-text capture ("Paste notes, vendor names, costs, deadlines,
   anything you've got"). This is the extraction signal. Skippable.
6. **Glenn drafts** — a clear "Glenn is drafting your starter plan…" state while the event is created and
   extraction runs.
7. **Land** — on `/events/[id]` (Command Center). If a starter package was produced, the landing funnels
   to Review ("review & apply to start"). If not, the landing shows the getting-started state with an
   **inline composer** so the user is never stuck.

A small **"quick create" escape hatch** (name only → straight to the event) remains for power users.

---

## 4. Route / API design

### 4.1 `POST /api/events/onboard` (new)

Authenticated user context + RLS only. **No service role.** Mirrors the auth/ownership model of the
existing `POST /api/events`.

**Request body (Zod-validated):**

```
{
  name:            string   // required (derived from type, editable)
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
   route logic: ensure profile → ensure org/membership → insert event → insert `event_members` owner).
   If create fails → return the error; **nothing else happens** (no partial state).
3. Build the extraction input: prefer `capture`; if empty, synthesize a minimal prompt from the card
   fields (e.g. *"Setting up a corporate dinner for 85 guests on Sep 27 in Boston. Draft an initial
   plan."*). Event metadata already rides into the extraction context (the event was just created with
   those fields), so the capture is the primary extraction signal — this avoids redundant proposals like
   "task: 85 guests."
4. **Best-effort** `runExtraction({ supabase, eventId, userId, inputText, channel: 'onboarding' })`,
   wrapped so neither a `{ ok: false }` result nor a thrown error is fatal.
5. Return `{ id, draft }` where `draft` ∈ `'ready' | 'empty' | 'skipped'` (+ `proposed_count` when ready).

The client routes to `/events/[id]` **regardless** of `draft`.

### 4.2 Why a dedicated route (vs. two client calls)

Keeping the general chat extract path (`/api/events/[id]/extract-updates`) free of any onboarding concept,
and centralizing best-effort handling + the single "creating + drafting" loading state server-side. The
event-create logic is factored into a shared helper so `/api/events` and `/api/events/onboard` don't
duplicate the profile/org bootstrap.

### 4.3 `channel: 'onboarding'`

`runExtraction` already accepts a `channel` param (files pass `'file'`), so **no change to
`run-extraction.ts` is expected.** The intake message is written with `channel: 'onboarding'`, which is the
signal the Review layer uses to label the package (see §5).

> **OPEN — verify before relying on it:** `messages.channel` was added in migration 009. If it carries a
> CHECK constraint that restricts allowed values, `'onboarding'` may require an additive migration.
> **Per the guardrails, STOP and ASK before any schema/constraint change** — do not silently add a
> migration. If unconstrained (free text), no migration is needed.

---

## 5. Starter Review package behavior

The starter proposals land as a **normal pending `ai_run` batch** — identical plumbing to a typed note.
Nothing is auto-applied; the Plan stays empty until the user applies.

Presentation-only changes make that batch read as a starter draft:

- **`lib/review.ts`** — when a package's source message has `channel: 'onboarding'`, give it the title
  **"Starter draft from setup"** and the lead copy *"Glenn drafted a starter plan from your setup answers.
  Review and apply it to start."*
- **`components/event/review-package-card.tsx`** — for that package, render the starter label + copy and a
  primary CTA reading **"Apply starter plan"** (this is the existing package-level apply, relabeled — it
  fans out to `/api/updates/[id]/approve` exactly as today).
- The safe-by-default **Ready / Needs-answer / Removals** structure is **untouched**. Removals still
  require deliberate per-row action; needs-answer still uses the clarify flow.

The Review package continues to live in `/chat` for this branch (the global Review drawer is
`event-home-shell`). The Command Center landing funnels to it.

**Provenance:** the applied starter records trace back to the onboarding intake `messages` row and its
`ai_run` — a real receipt, the same as any other reviewed change.

---

## 6. Landing behavior (Command Center, v1)

Embed `<GlennInput variant="plain">` in the Command Center's **getting-started / empty** state (replacing
the bare `/chat` link), so the landing is never a dead end. `GlennInput` is already built for this — it
exposes a `placeholder` override commented *"e.g. for empty-event onboarding"* and a `variant="plain"`.

Two post-onboarding landing scenarios:

- **Draft ready** (`pendingUpdates > 0`): `planIsEmpty` is false → the populated layout renders with the
  existing **"Review pending"** affordance funnelling to the labeled starter package in `/chat`. Not a
  dead end. (Composer not required here in v1.)
- **Draft skipped / empty** (no pending): `planIsEmpty` is true → the getting-started state renders with
  the **inline composer** — the user can immediately tell Glenn what they know.

The populated-state inline composer (always-present) is deferred to `event-home-shell`.

---

## 7. Failure / degraded path

| Situation | Outcome |
|---|---|
| Event create fails | API returns error; wizard shows it; **nothing created** (no partial state). |
| Create OK, extraction 503 (no `ANTHROPIC_API_KEY`, no `GLENN_USE_MOCK`) | **Event still created.** The mock-fabrication guard (a123c78) deletes the intake message and creates **no** proposals — **zero fabricated records.** `draft: 'skipped'`. User lands on the getting-started state + inline composer. |
| Create OK, extraction throws | Same as above — swallowed, `draft: 'skipped'`, clean landing. |
| Create OK, extraction returns 0 proposals | `draft: 'empty'`. Clean landing; optional subtle "tell Glenn more" hint. |
| Create OK, extraction succeeds | `draft: 'ready'`, `proposed_count`. Landing funnels to the labeled starter package in Review. |

The degraded path is the most important trust property: **a missing key never produces invented data** —
it produces an event with an empty, honest, ready-to-use workspace.

In production (`glenn-events.netlify.app`, key set) the real loop runs and the draft is genuine.
`maxDuration=60` already exists on the extract route (a123c78), so the draft step won't time out on Netlify.

---

## 8. Files likely touched

| File | Change |
|---|---|
| `app/(app)/events/new/page.tsx` | Replace static form with the mobile-first guided wizard; keep a small name-only quick-create escape hatch. |
| `components/event/onboarding/*` (new) | Wizard + step components (type cards, guest count, date, location, capture, "Glenn is drafting" state). |
| `app/api/events/onboard/route.ts` (new) | Create event (shared helper) → best-effort `runExtraction` with `channel: 'onboarding'`. |
| `lib/events/create-event.ts` (new) or shared helper | Factor the profile/org/event/member bootstrap out of `/api/events` so both routes reuse it. |
| `lib/review.ts` | Onboarding-channel package label + lead copy. |
| `components/event/review-package-card.tsx` | Starter label/copy + "Apply starter plan" CTA (presentation only). |
| `components/event/command-center.tsx` | Inline `GlennInput` in the getting-started/empty state. |

`run-extraction.ts` is expected to need **no change** (`channel` is already a param).

---

## 9. What NOT to touch

- Extraction internals (`lib/ai/llm-extract.ts`, `mock-extract.ts`, prompt logic), `lib/ai/dedupe.ts`.
- The approve / reject / provenance routes and the provenance drawer.
- The M22 file pipeline (`files/route.ts`, `file-library.tsx`, `attach-button.tsx`, upload path).
- The Review card's safe-by-default Ready / Needs-answer / Removals decision structure (add label/CTA
  only).
- **No** auto-apply, **no** seeder, **no** Review-gate exception.
- **No** nav rename to Home, **no** Event Brief layout, **no** persistent/global Review drawer, **no**
  Files merge.
- **No** schema change without stopping to ask first (the `messages.channel` constraint check).

---

## 10. Acceptance criteria

- Guided setup completes on a **390px** viewport (cards → capture → drafting → land).
- The event row is created with the card fields.
- Glenn produces a **pending** starter Review package from the user's own words, **clearly labeled**
  "Starter draft from setup," with provenance back to the intake message.
- **The Plan is empty before applying.** Nothing is auto-written.
- Clicking **"Apply starter plan"** populates the Plan (existing apply path).
- A **follow-up** note from the landing composer goes through the **normal** Review flow (not auto-applied).
- **No-key / 503 path** creates the event and **does not fabricate** any records; the landing is usable.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` all pass.

---

## 11. Manual QA plan

On a **fresh** event "Ava & Sam — Garden Wedding," 390px viewport, `NEXT_PUBLIC_SHOW_AI_DEBUG=true`:

1. Run guided setup end-to-end → verify the event row fields (name/type/date/location/guests).
2. Verify a **labeled** starter Review package appears in `/chat` ("Starter draft from setup").
3. Verify the **Plan is empty** before applying (every tab, no records).
4. Tap **"Apply starter plan"** → Plan populates; provenance on a record traces back to the onboarding
   intake message.
5. From the landing **inline composer**, send a follow-up note → confirm it produces a **new** normal
   Review batch (not auto-applied).
6. **Degraded path:** simulate a 503 (unset `ANTHROPIC_API_KEY` locally, no `GLENN_USE_MOCK`) → run setup
   → confirm the event is created, the landing is usable, and **zero** records/proposals were fabricated.
7. Confirm the quick-create escape hatch still works (name only → event).

---

## 12. Risks & rollback

**Risks**

- **Thin-input draft quality** — a sparse capture yields a thin draft. Mitigate: capture-as-primary-signal
  + a strong "Glenn is drafting…" state; validate quality in QA. (A thin but honest draft is acceptable.)
- **Degraded mode** — must create the event and land cleanly with no fabrication. Covered by best-effort
  extraction + the a123c78 guard; explicitly tested (QA #6).
- **`messages.channel` constraint** — may need an additive migration. **Stop and ask first** (guardrail).
- **Redundant proposals** from structured facts — mitigated by using the capture as `inputText` and
  letting event metadata ride in context.
- **New mobile wizard surface** — keep it simple (one step per screen, big targets), reuse existing
  tokens/components; no new UI framework.

**Rollback**

- Stacked feature branch; rollback is branch-level (`git branch -D onboarding-guided-setup` / don't merge).
- No destructive schema changes are planned. If the channel check forces a migration, it is **additive**
  and reversible; it will not be made without explicit approval.
- All touched product flows (extraction, review, apply, provenance) are reused, not forked — so reverting
  the branch fully restores prior behavior.

---

## 13. Implementation checkpoints

1. **This commit** — branch + this planning doc only.
2. Guided wizard UI (replaces `/events/new`) + quick-create escape hatch.
3. Shared create helper + `POST /api/events/onboard` (create → best-effort extraction).
4. Onboarding-channel Review package label + "Apply starter plan" CTA.
5. Inline composer on the getting-started landing.
6. Manual QA (§11) + typecheck/lint/build, then report. **No push** without approval.

---

*End of plan. Implementation happens on `onboarding-guided-setup`; this file is the plan of record.*
