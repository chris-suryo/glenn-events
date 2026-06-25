# Glenn Events — CLAUDE.md

Always read **`docs/PRODUCT_SOUL.md`** before making **product** or **architecture** decisions (north star, core workflow, MVP phases, command center priorities, trust and approval).

## Product Vision

Glenn Events is an **agentic event operations workspace** for small event teams.
The core promise: dump messy planning notes → Glenn extracts structured proposed updates → user reviews/approves → approved updates populate the event plan.

It is NOT a ticketing, RSVP, seating chart, vendor marketplace, or general event dashboard product.

**Brand voice:** calm, organized, operational, trustworthy.
**AI persona:** "Glenn" — always-available event operations teammate.

## Target Users
- Small corporate event teams
- Boutique event organizers
- Coworking/community event managers
- Nonprofit event coordinators
- Startup/community event operators

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router, TypeScript) |
| Styling | Tailwind CSS + shadcn/ui |
| Database / Auth | Supabase (Postgres, Auth, RLS, Realtime) |
| Validation | Zod |
| Deployment | Vercel |

## Architecture Decisions

1. **Server Components by default** — opt into `"use client"` only for interactive islands (inputs, approve/reject buttons, dropdowns).
2. **`@supabase/ssr`** for cookie-based auth. Auth proxy at `proxy.ts` protects all `(app)` routes (Next.js 16 renamed `middleware.ts` → `proxy.ts`).
3. **No service role key in app routes** — server actions use the authenticated user context + RLS. Service role is dev-scripts only (`scripts/`).
4. **Approval flow via fetch to API routes** — mutations go through `/api/updates/[id]/approve` and `/api/updates/[id]/reject`, which use the user session.
5. **Real LLM extraction live** — `extract-updates` route uses `claude-haiku-4-5` via `lib/ai/llm-extract.ts` if `ANTHROPIC_API_KEY` is set; falls back to `lib/ai/mock-extract.ts` if not. Tool-use schema uses grouped arrays per type (separate `tasks[]`, `vendors[]`, etc.) — avoids discriminated-union complexity. The model has no inherent sense of the current date, so the system prompt is anchored with `buildTodayDirective(now, timeZone)` (`lib/ai/date-context.ts`): it states today's wall-clock date **in the event's timezone** and tells Glenn to resolve year-less/relative dates against it (next future occurrence, never a past year). Without this, dated values default to a training-era year. The event tz flows in via `EventStateContext.event.timezone` (falls back to `DEFAULT_EVENT_TZ`). Model is overridable via `ANTHROPIC_EXTRACT_MODEL` / `ANTHROPIC_FILE_EXTRACT_MODEL`. **The chat reply's item list is app-composed, not the model's prose** — the model writes only a confirmation sentence + optional heads-up, and `composeProposalDigest(items)` (`lib/ai/compose-reply.ts`) builds the authoritative "what I proposed" bullets from the **actually-emitted** `items[]`, so the reply can never claim an update Glenn didn't produce (smoke-test D16). `stripItemBullets` removes any bullets the model emits anyway; the review-gate reminder is appended app-side on the first note; the prompt forbids persistence words ("Saved"/"Added"/"Done") since nothing is applied until approved.
6. **`payload_json` is strongly typed** — each `proposed_updates` row has a `payload_json` that maps 1:1 to the destination table insert shape. This makes the approval flow straightforward.
7. **Overview "Brief" is a cached AI summary with a deterministic fallback** — `events.ai_summary` (migration 014) holds a Glenn-authored situation brief generated on demand via `POST /api/events/[id]/summary` (`lib/ai/event-summary.ts`, `claude-haiku-4-5`, written with the user session so RLS applies; no service role). It is **not** auto-generated on load (cost) — the user clicks Generate/Refresh. Until a summary exists (or migration 014 is applied), the Overview shows a data-assembled brief built from event fields + counts. The Anthropic client is instantiated lazily inside the generator so the no-key fallback path doesn't throw at import.
8. **Event times render in the event's timezone, not UTC** — `timestamptz` stores a UTC instant and drops the original offset, so all event-time display goes through `parseTimelineDateValue(value, timeZone)` (`lib/timeline-format.ts`) and `formatEventDateTime(value, opts, timeZone)` (`lib/utils.ts`), which resolve the instant to local wall-clock via `Intl.DateTimeFormat({ timeZone })`. The zone comes from `events.timezone` (migration 015), falling back to `DEFAULT_EVENT_TZ` (`America/New_York`) when unset. **Never** read `.getHours()`/regex the literal hour off a timestamptz string for display — that yields UTC. Date-only strings are calendar dates and are never timezone-shifted. **On the WRITE side, the inverse must also hold:** a naive wall-clock the model extracts (`2026-09-18T12:00:00`, no offset) must be resolved to a UTC instant in the event tz before it hits a `timestamptz` column, or it stores as midnight/noon-UTC and renders hours off (smoke-test D5). `zonedWallClockToUtc(value, timeZone)` (`lib/timeline-format.ts`, the DST-aware inverse of `parseTimelineDateValue`) does this; `buildDestinationRow(update, timeZone)` applies it to timeline `starts_at`/`ends_at`, with the event tz fetched in the approve route. The same conversion runs on the **manual Edit path**: the timeline Edit dialog uses `datetime-local` inputs seeded via `toDateTimeLocalValue(value, timeZone)` (shows the stored instant as event-local wall-clock) and submits the naive wall-clock, which the records PATCH route resolves via `zonedWallClockToUtc`. **Calendar-date facts** — `events.event_date` and `tasks.due_date` — are `date` columns (migration 017), written day-only (`.slice(0,10)`); they are never instants and never tz-shifted.
9. **Review groups updates into per-component tiles** — Glenn tags every extracted item with a `group` (the real-world thing it's about: "Petal & Stem", "Cake", "DJ", "Venue") via the `GROUP_PROPERTY` field on each tool-schema type in `lib/ai/llm-extract.ts` (system-prompt rule 29). It flows through `run-extraction.ts` onto `proposed_updates.group_label` (migration 016). The Review panel (`components/event/review-package-card.tsx`, `groupByComponent`) buckets the **safe** updates by `group_label` and renders a tile per component with a block-approve button. **Defensive fallback:** tiles only show when the batch has 2+ distinct labels; otherwise (or when labels are missing — old rows, mock extractor, pre-migration) it renders the original flat list, so the approve flow never regresses. `group` is optional end-to-end.
10. **High-level event facts are edited through Glenn (the `event_detail` update type), review-gated** — the event's own `event_date`, `attendee_target`, `budget_target`, and `location` live on the `events` row, not a plan table, and are set-once at creation. To change them after, Glenn extracts an `event_detail` proposed update (`update_type` is `text`, no enum migration needed) when a note states/changes one of these (`lib/ai/llm-extract.ts` `event_details` schema + the "Event-level facts" prompt section; mapped with `operation: 'update'`, `target_record_type: 'event_detail'`, `target_record_id` = the event id, and a `target_snapshot_json` of the current facts captured in `run-extraction.ts` `resolveCorrectionTargets`). Approve has a **dedicated branch** (`app/api/updates/[id]/approve/route.ts`) that patches the `events` row directly (the table has no `event_id`/provenance columns, so it can't reuse `CORRECTION_TARGETS`); it patches only non-null fields and writes `activity_log` (`event_details_updated`). These are **high-stakes**: `buildReviewPackages` pulls them into their own `eventDetails` partition (never in `safe`), and the Review card renders them in a distinct indigo "your explicit OK needed" section, **approved one at a time, never in bulk**. `getEventDetailChanges` shows the before→after diff from the snapshot. Reject is generic. `buildDestinationRow` throws for `event_detail` (it must never reach the insert path).

## Folder Structure

```
app/
  (auth)/login/          — login/signup
  (app)/
    dashboard/           — event list
    events/new/          — create event
    events/[eventId]/    — overview (command center)
      chat/              — message history + proposed updates queue
      plan/              — Plan tabs: Run of Show · Vendors · Budget · Tasks · Open Items
      tasks/ vendors/ budget/ timeline/ decisions/ risks/ open-questions/ — legacy routes; redirect into the matching Plan tab
    settings/            — account settings
  api/
    events/[eventId]/extract-updates/  — POST: mock AI extraction
    events/[eventId]/summary/          — POST: generate cached Glenn brief (events.ai_summary)
    updates/[id]/approve/              — POST: approve a proposed update
    updates/[id]/reject/               — POST: reject a proposed update

components/
  ui/          — shadcn primitives
  event/       — event-specific components (command-center, glenn-input, etc.)
  shared/      — layout, nav, logo

lib/
  supabase/    — client.ts (browser), server.ts (SSR)
  types/       — shared TypeScript types (all DB row types + payload shapes)
  utils.ts     — cn(), formatDistanceToNow()
  validators/  — Zod schemas (ExtractUpdatesSchema)

supabase/migrations/  — SQL migration files
scripts/              — seed-demo.ts (dev only)
```

## Coding Standards

- **TypeScript strict** — no `any`, no unchecked type assertions without a comment explaining why.
- **No hardcoded user IDs** in app code. Seed scripts may use env-configured emails.
- **Zod at API boundaries** — validate all POST bodies.
- **No comments explaining what code does** — names should be self-explanatory. Only add comments for non-obvious WHY.
- **No premature abstraction** — three similar lines > a helper that adds complexity.
- **Empty states on all list views** — every data list has a friendly empty state.
- **Loading skeletons** — add `loading.tsx` files for routes that fetch data.
- **New auth routes need `isPublic` entry** — add any new `/(auth)/` or `/auth/` routes to the `isPublic` array in `proxy.ts` or they'll redirect to `/login`.
- **`@base-ui/react` has no `asChild`** — `DropdownMenuTrigger` must be styled directly via `className`; never wrap in a `<button>` child. Applies to all `@base-ui/react` primitives.
- **Supabase join shape is ambiguous** — `.select('user_id, profiles(full_name)')` may return `profiles` as an object or `[object]`. Always guard: `const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles`.
- **`OpenQuestion.status` is `'open' | 'answered'`** — not 'resolved'. Budget item vendor references are stored as `(Vendor reference: [name])` suffix in `description`; parse with `/\(Vendor reference: ([^)]+)\)/`.
- **`express-rate-limit` in package.json is unused** — it's Express-only and incompatible with Next.js App Router. Rate limit via DB count: `.select('id', { count: 'exact', head: true }).gte('created_at', oneHourAgo)`.
- **Update docs in the same change as the code** — when a change alters behavior, schema, migrations, routes, or env vars, update the relevant docs (`docs/DEPLOYMENT.md`, this `CLAUDE.md`, etc.) in the same commit. Migrations are manual-apply, so adding a `supabase/migrations/NNN_*.sql` means also adding it to the `DEPLOYMENT.md` migration list. Don't let docs drift.
- **Unit tests via vitest** — `npm test` runs the offline pure-logic suites (`*.test.ts` next to source: `lib/timeline-format`, `lib/utils`, `lib/review`, `lib/ai/dedupe`, `lib/ai/reconcile`, `lib/ai/run-extraction`, `lib/ai/complete-packages`, `lib/ai/compose-reply`, `lib/ai/pricing`, `lib/ai/debug-format` — 109 tests across 10 files). No network/LLM/DB. Add to the validation set (`typecheck && lint && test && build`) when touching that logic. **Never pipe verification through `tail`** — it hides the non-zero exit code; use `&& echo OK` instead. `npm run test:coverage` (v8) reports coverage scoped to the unit-testable logic layer (`lib/**`, I/O modules excluded — see `vitest.config.ts`); baseline ≈44% lines, no threshold gate yet. Component/API tests (jsdom/RTL, Supabase mocks) are deferred — see `docs/RISKS_AND_EDGE_CASES.md`.
- **CI runs the gate on every push/PR** — `.github/workflows/ci.yml` runs `typecheck → lint → test → build` on Node 22 (`npm ci`), no secrets needed (offline tests + placeholder build env). Keep it green; a red check blocks merge. Details in `docs/DEPLOYMENT.md` §8.

## Core UI Principles

- **Clean, premium, operational** — not a cluttered analytics dashboard.
- **Glenn is the operating center** — the command center should feel like talking to a teammate, not reading a report.
- **Primary color: indigo** — brand accent. Slate for backgrounds and borders.
- **No fake AI marketing copy** — direct, factual, calm.

## Key Screens

| Screen | Route | Purpose |
|---|---|---|
| Login | `/login` | Email/password auth |
| Dashboard | `/dashboard` | Event cards list |
| Create Event | `/events/new` | New event form |
| Overview | `/events/[id]` | Main operating view — brief, stats, tasks, vendors, risks, Glenn input |
| Chat | `/events/[id]/chat` | Input history + proposed updates queue |
| Plan | `/events/[id]/plan` | 5 tabs: Run of Show · Vendors · Budget · Tasks · Open Items |
| Settings | `/settings` | Account |
| Forgot Password | `/forgot-password` | Sends Supabase reset email |
| Update Password | `/update-password` | Sets new password after email link |

> Legacy per-type routes (`/tasks`, `/vendors`, `/budget`, `/timeline`, `/risks`, `/decisions`, `/open-questions`) redirect into the relevant **Plan** tab. The **Open Items** tab merges open questions, risks, and decisions into one place.

## Database Tables (summary)

profiles, organizations, organization_members, events, event_members, messages, ai_runs, proposed_updates, tasks, vendors, budget_items, timeline_items, decisions, risks, open_questions, files, activity_log

See `supabase/migrations/001_init.sql` for full schema + RLS.

## Approval Flow

1. User submits text via `GlennInput`
2. `POST /api/events/[id]/extract-updates` creates `messages`, `ai_runs`, `proposed_updates` rows
3. `ProposedUpdatesQueue` shows pending updates in `/chat`
4. User clicks Approve: `POST /api/updates/[id]/approve` inserts into destination table, updates status, writes activity_log
5. User clicks Reject: `POST /api/updates/[id]/reject` updates status, writes activity_log

## Implementation Phases

- **Phase 1** Done — Project shell, branding, route stubs, CLAUDE.md
- **Phase 2** Done — Supabase schema (17 tables), RLS, API stubs, seed script, cleanup
- **Phase 3** Done — Real-data runtime, command center, open questions, RLS tighten, status alignment
- **Phase 3.5** Done — UI vibe pass (premium design tokens, sidebar, Glenn input, proposed updates queue, all tab pages)
- **Phase 4** Done — Mock AI extraction: `lib/ai/mock-extract.ts`, full `extract-updates` route, message/ai_run/proposed_updates/activity_log writes
- **Phase 5** Done — Approve/reject writes to destination tables (tasks, vendors, budget_items, timeline_items, decisions, risks, open_questions)
- **Phase 6** Done — Demo polish: approve hardening (optimistic lock), open_question owner_name, Recent Activity on command center, idempotent seed + seed:reset, MVP demo script
- **Phase 7** Done — Real LLM (Anthropic tool-use), rate limiting, inline CRUD (vendors/budget/risks/decisions/open-questions), task assignment with member avatars, Google OAuth button, AI source traceability badges, Timeline calendar view, password reset flow, Sentry setup, `docs/DEPLOYMENT.md`

> **Production-ready foundation complete.** `ANTHROPIC_API_KEY` is set and extraction uses real Claude.
> Do not add email, SMS, RSVP, payments, ticketing, or marketplace features.

## Environment Variables

See `.env.example`. Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (scripts only)

## Branch Closeout Checklist

Run this at the end of every branch before handing back. Keep it lightweight — a
short report, not ceremony. See `docs/WORKSPACE.md` for the base-of-operations
context this feeds.

Report:
- **Branch name** and **commit hash(es)**
- **Files changed** (`git status --short` / `git diff --stat`)
- **Validation results** — typecheck/lint/build if app code changed; `git diff --check` always
- **Manual QA status** — what was verified, what wasn't
- **Known limitations** — anything intentionally deferred or unverified
- **Next recommended branch**

Confirm before stopping:
- `git status --short` reported
- `.claude/launch.json` is **unstaged** (never committed)
- `git stash@{0}` (`m19-visual-polish` WIP) is **untouched** — `git stash list` unchanged
- **No push** unless the user explicitly asked
- `docs/PRODUCT_CHECKPOINT.md` updated to reflect the new milestone (when the
  branch changes product state)
