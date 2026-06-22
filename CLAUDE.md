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
5. **Real LLM extraction live** — `extract-updates` route uses `claude-haiku-4-5` via `lib/ai/llm-extract.ts` if `ANTHROPIC_API_KEY` is set; falls back to `lib/ai/mock-extract.ts` if not. Tool-use schema uses grouped arrays per type (separate `tasks[]`, `vendors[]`, etc.) — avoids discriminated-union complexity.
6. **`payload_json` is strongly typed** — each `proposed_updates` row has a `payload_json` that maps 1:1 to the destination table insert shape. This makes the approval flow straightforward.

## Folder Structure

```
app/
  (auth)/login/          — login/signup
  (app)/
    dashboard/           — event list
    events/new/          — create event
    events/[eventId]/    — command center
      chat/              — message history + proposed updates queue
      tasks/             — task list
      vendors/           — vendor list
      budget/            — budget items
      timeline/          — timeline items
      decisions/         — decisions log
      risks/             — risk register
    settings/            — account settings
  api/
    events/[eventId]/extract-updates/  — POST: mock AI extraction
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
| Tasks | `/events/[id]/tasks` | Task list |
| Vendors | `/events/[id]/vendors` | Vendor list |
| Budget | `/events/[id]/budget` | Budget line items |
| Timeline | `/events/[id]/timeline` | Milestones/deadlines |
| Decisions | `/events/[id]/decisions` | Decision log |
| Risks | `/events/[id]/risks` | Risk register |
| Settings | `/settings` | Account |
| Forgot Password | `/forgot-password` | Sends Supabase reset email |
| Update Password | `/update-password` | Sets new password after email link |
| Open Questions | `/events/[id]/open-questions` | Question log with resolve actions |

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
