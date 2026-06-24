# Glenn Events — System Capabilities (current state)

> **Purpose:** a self-contained brief of what Glenn Events *is* and *what's built right now*,
> written so another AI (e.g. one helping draft prompts/feature requests) can read it cold.
> Companion to `CLAUDE.md` (engineering rules), `PRODUCT_SOUL.md` (north star),
> `FUTURE_STATE_PRODUCT_PLAN.md` (roadmap), `PILOT_READINESS_AUDIT.md` (gaps).
> Last updated after the Overview/Run-of-Show/timezone work (migrations through 015).

## 1. What it is

Glenn Events is an **agentic event-operations workspace** for small event teams. The core
promise: **dump messy planning notes → "Glenn" extracts structured proposed updates → the
user reviews/approves in a gate → approved updates populate the event plan**, and every
record keeps a link back to its source.

It is **NOT** a ticketing, RSVP, seating-chart, vendor-marketplace, or generic dashboard
product. Brand voice: calm, organized, operational, trustworthy. "Glenn" is the always-on
event-ops teammate persona.

## 2. The core loop (the product's spine)

1. User submits text (or uploads a file) via **Ask Glenn** / the Glenn input.
2. `POST /api/events/[id]/extract-updates` → real LLM extraction (`lib/ai/run-extraction.ts`
   → `lib/ai/llm-extract.ts`, **`claude-haiku-4-5`**, Anthropic tool-use) writes a `messages`
   row, an `ai_runs` row (telemetry), and N `proposed_updates` rows (status `pending`).
3. The **Review** surface shows the pending proposed updates grouped by run, with the source
   attached ("Glenn did the reading. The source stays attached.").
4. User **approves** → `POST /api/updates/[id]/approve` inserts into the destination table
   (tasks/vendors/budget_items/timeline_items/decisions/risks/open_questions), flips the
   update to `applied` (optimistic lock), and writes `activity_log`. **Rejects** →
   `/api/updates/[id]/reject`. Corrections patch an existing row; cancellations archive.
5. The **Plan** reflects approved records. **Nothing is applied silently** — Review is the gate.

**Trust model (do not erode):** every fact has a receipt (source → proposal → diff →
approver); uncertainty becomes an open question, never an invented fact; the Review gate is
the product.

## 3. Tech stack

Next.js 16 (App Router, TypeScript strict) · Tailwind v4 + shadcn/ui on `@base-ui/react` ·
Supabase (Postgres, Auth, RLS) via `@supabase/ssr` · Zod at API boundaries · Anthropic SDK ·
**deployed on Vercel** (migrated off Netlify). Auth proxy at `proxy.ts` protects `(app)`
routes; `/api/*` is public and enforces auth in-handler. **No service-role key in app code** —
server actions use the authed user + RLS; service role is dev-scripts only.

## 4. Screens / navigation (current)

Global: **Dashboard** (event cards) · **Settings**. Inside an event:
- **Overview** (`/events/[id]`, renamed from "Command Center") — the visual command center:
  an AI-written **Brief** band (with a Refresh control), **KPI tiles** (open tasks; vendors
  confirmed ratio w/ ring; est. budget w/ gauge vs target; open risks; open questions), a
  **"Needs your attention"** prioritized list, and a right rail (compact Review card · Run of
  Show mini-timeline · Recent activity). Inline countdown to the event date in the header.
- **Ask Glenn** (`/chat`) — conversation thread on the left, structured **Review** panel on
  the right (proposed-update cards: Ready-to-apply / Needs-your-answer / Removals; Apply-safe,
  Approve, Reject, Edit). Chat is natural-language; approvals stay in the structured panel.
- **Plan** (`/plan`) — **5 tabs**: **Run of Show · Vendors · Budget · Tasks · Open Items**
  (Open Items merges questions + risks + decisions). Run of Show has Lead-up (month calendar),
  Day-of (Google-Calendar-style overlapping grid with "overlaps to watch"), and List — shown
  **together on desktop**, toggled on mobile.
- **Event Library** (`/library`) — upload PDFs/images/text; Glenn reads them as **sources**
  and proposes updates; the file stays linked as the receipt.
- **Activity** (`/activity`) — the source-traced action log.

Legacy per-type routes (`/tasks`, `/vendors`, `/risks`, etc.) redirect into the Plan tabs.
A persistent **Review companion** (chip + drawer) surfaces pending updates from any event
route except chat/Overview (which show their own review entry).

## 5. Data model (Supabase, `public` schema)

Core tables: `profiles`, `organizations`, `organization_members`, `events`, `event_members`,
`messages`, `ai_runs`, `proposed_updates`, and the destination tables: `tasks`, `vendors`,
`budget_items`, `timeline_items`, `decisions`, `risks`, `open_questions`, plus `files`,
`activity_log`. RLS on all; membership via `is_event_member()` / `is_org_member()`.

Key columns & enums:
- `events`: name, description, event_type, event_date (timestamptz), location, attendee_target,
  budget_target, status (`planning|active|completed|archived`), **ai_summary** + ai_summary_updated_at
  (migration 014), **timezone** (IANA, migration 015), organization_id, created_by.
- `tasks`: title, description, owner_user_id, due_date, status (`todo|in_progress|done|blocked`),
  priority (`low|medium|high`).
- `vendors`: name, category, contact_name, status (`prospect|contacted|confirmed|declined`),
  estimated_cost, notes, archived_at.
- `budget_items`: category, description, estimated_cost, status (`estimated|committed|paid`),
  vendor_id (FK, currently under-used — vendor refs are also kept as a `(Vendor reference: …)`
  suffix in description), archived_at.
- `timeline_items`: title, starts_at/ends_at (timestamptz), type (`deadline|milestone|planning|task`),
  archived_at.
- `risks`: title, description, severity (`low|medium|high`), status (`open|monitoring|resolved`),
  mitigation.
- `decisions`: title, description, status (`pending|decided`), decision.
- `open_questions`: question, status (`open|answered`), answer.
- Every proposed/applied record carries provenance: `proposed_update_id`, `source_message_id`,
  `ai_run_id`, `ai_generated`.

## 6. AI surfaces

- **Extraction** — `claude-haiku-4-5`, Anthropic tool-use with grouped arrays per type. Strong
  on multi-fact messy notes, vendor *packages* (one sentence → vendor + budget + timeline),
  corrections, cancellations/replacements. Will not invent facts; stated unknowns become open
  questions; an intake-only note (no concrete facts) returns no records + an intake reply.
  Falls back to a deterministic **mock extractor** (`lib/ai/mock-extract.ts`) only when
  `GLENN_USE_MOCK=true` (a missing key must never silently fabricate).
- **Overview Brief** — `events.ai_summary`, a cached 2-sentence Glenn-authored brief (bold key
  figures) generated on demand via `POST /api/events/[id]/summary` (`lib/ai/event-summary.ts`,
  haiku). Not auto-generated on load; the user clicks Generate/Refresh. Until generated, a
  deterministic data-assembled brief shows.
- **Telemetry** — `ai_runs` records model/provider/tokens/cost/duration (migration 011);
  pricing in `lib/ai/pricing.ts`.

## 7. What's built vs. not

**Built & live:** Vercel hosting; auth (email/password + Google OAuth) + password reset;
guided event create/onboarding; the full extract → review → approve loop (typed notes + file
upload + image extraction) with provenance; consolidated nav (Plan 5 tabs); the visual
Overview (Brief + KPI gauges + attention + rail); Run of Show (lead-up + day-of grid + list,
combined on desktop); **event-timezone-correct** time rendering; AI brief; **per-component
review tiles** (Glenn groups related proposed updates into one block per real-world thing);
**review-gated editing of high-level event facts** (date / guest count / budget / location are
optional at creation and changed afterward by telling Glenn — an `event_detail` proposal you
approve individually patches the event row); the seeded demo event "Apex Capital Client Dinner".

**Not built yet (roadmap):** member **invite flow** (multi-user is seed/bootstrap only today —
the key unblocker for people-assignment); cross-event **Home**; correction-aware
timeline/decision **dedupe** (re-upload can duplicate); **DB indexes** (none yet) + pagination;
`UNIQUE(proposed_update_id)`; approve/RLS **tests + CI**; **Files-merge** (Library + Activity);
the richer day-of calendar (hard-constraint line, multi-day Gantt bars).

## 8. Known limitations / gotchas

- Migrations are **manual-apply** (no runner): adding `supabase/migrations/NNN_*.sql` means the
  owner runs it in the Supabase SQL editor and it's listed in `docs/DEPLOYMENT.md`. Migrations
  014 (ai_summary) and 015 (timezone) are owner-applied; code degrades gracefully without them.
- `timestamptz` stores a UTC instant (offset dropped) — all event-time display goes through
  `parseTimelineDateValue(value, timeZone)` / `formatEventDateTime(value, opts, timeZone)` using
  the event's `timezone` (default `America/New_York`). Never read the literal hour off the string.
- `@base-ui/react` has no `asChild`. `OpenQuestion.status` is `open|answered`. `express-rate-limit`
  is unused (rate-limit via DB count).

## 9. How to phrase prompts / requests for this codebase

- **Respect the trust spine.** Don't propose anything that applies Glenn's changes without the
  Review gate, hides the source, or invents data. Features should *strengthen the loop*.
- **Records are atomic; tabs are projections.** New meaning enters as links/derived views, not
  by restructuring the schema. Ask for "a view/grouping," not "a new table," unless truly needed.
- **Name the surface + file area.** e.g. "On the Overview (`components/event/command-center.tsx`)
  …", "In the extraction prompt (`lib/ai/llm-extract.ts`) …", "In Run of Show
  (`components/event/timeline-calendar.tsx` / `day-of-grid.tsx`) …".
- **Be explicit about AI cost/determinism.** Anything calling the LLM should say when it runs
  (on-demand vs every load) and how it's kept token-tasteful.
- **Migrations are manual.** A schema change = a new `supabase/migrations/NNN_*.sql` + a
  `DEPLOYMENT.md` entry + graceful fallback until the owner applies it.
- **Workflow:** work happens on a feature branch, verified with `npm run typecheck` + `lint` +
  `build`, then promoted to `main` (production auto-deploys from `main`).
