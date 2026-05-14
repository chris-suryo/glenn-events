# Glenn Events — CLAUDE.md

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
| Deployment | Netlify-compatible |

## Architecture Decisions

1. **Server Components by default** — opt into `"use client"` only for interactive islands (inputs, approve/reject buttons, dropdowns).
2. **`@supabase/ssr`** for cookie-based auth. Auth proxy at `proxy.ts` protects all `(app)` routes (Next.js 16 renamed `middleware.ts` → `proxy.ts`).
3. **No service role key in app routes** — server actions use the authenticated user context + RLS. Service role is dev-scripts only (`scripts/`).
4. **Approval flow via fetch to API routes** — mutations go through `/api/updates/[id]/approve` and `/api/updates/[id]/reject`, which use the user session.
5. **Mock AI first** — `/api/events/[eventId]/extract-updates` is deterministic keyword-matching. Real model wired later.
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
| Command Center | `/events/[id]` | Main operating view — brief, stats, tasks, vendors, risks, Glenn input |
| Chat | `/events/[id]/chat` | Input history + proposed updates queue |
| Tasks | `/events/[id]/tasks` | Task list |
| Vendors | `/events/[id]/vendors` | Vendor list |
| Budget | `/events/[id]/budget` | Budget line items |
| Timeline | `/events/[id]/timeline` | Milestones/deadlines |
| Decisions | `/events/[id]/decisions` | Decision log |
| Risks | `/events/[id]/risks` | Risk register |
| Settings | `/settings` | Account |

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
- **Phase 3** — Mock AI extraction endpoint (keyword-matched, deterministic)
- **Phase 4** — Approval flow (approve/reject writes to destination tables)
- **Phase 5** — Polish, loading skeletons, empty states, build clean

## Environment Variables

See `.env.example`. Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (scripts only)
