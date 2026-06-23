# Glenn Events — Future-State Product Plan

> Companion to `PRODUCT_SOUL.md` (identity, never changes) and
> `PRODUCT_CHECKPOINT.md` (current state, updated per milestone).
> This document is the bridge: where the product is going and the
> branch-sized path to get there. Written June 2026, post-m16.

## 0. M19 Direction Update (post-M18)

A product-direction pass (full detail in `docs/M19_PRODUCT_DIRECTION.md`)
sharpened the near-term path. Headlines, all consistent with the thesis:

- **Phone-first is now the headline, not a guardrail.** The planner captures
  and reviews in the field, on a phone. Capture + review must be genuinely good
  on mobile before document capture makes the phone primary.
- **Simpler IA (evolving §2's "stable" claim).** Toward a phone-first hybrid
  shell — **Today · Ask Glenn · Plan · Event Library · Activity** — where
  "Today" merges Dashboard + Command Center into one landing. The *surface
  responsibilities* in §4 are stable; their *phone-first packaging* is the new
  decision. Records stay atomic; no surface label enters business logic; no
  rename in code until pilots validate labels.
- **Event Library = documents as a capture channel** (extends §5 beyond audio).
  Uploaded PDFs/images become **linked sources of truth** Glenn extracts from:
  `file → extract text/vision → messages row → existing extract-updates →
  review batch → Plan`, file persists as the receipt. NOT Dropbox/Drive — files
  are sources Glenn reads, not inert storage. Safe MVP is store→extract→
  review→provenance (Stages 1–4); typed contract/menu parsers wait for evidence.
- **Visual Run of Show** = the *day-of* mode of `timeline_items` (the `type`
  field already distinguishes), a mobile-vertical lane view with overlap/gap
  flagging. MVP read-only; drag/edit later.
- **Reconciled roadmap:** m17 (review-state reconciliation) and m18 (coordinated
  package recall) shipped. Next 8: **m19-deployment-readiness →
  m20-entity-linking-vendor-anchor → m21-mobile-first-responsive-polish →
  m22-event-library-file-upload → m23-document-image-extraction →
  m24-today-command-center-refresh → m25-visual-run-of-show →
  m26-guided-create-to-intake.** (The m17–m24 table in §6 below predates this
  reconciliation; M19 doc §8 is authoritative.)
- **Tomorrow:** deployment readiness — every phone-first, document, channel, and
  pilot ambition is blocked on a hosted URL, and the loop is reliable enough to
  ship.

## 1. Product Vision (future state)

Glenn turns messy event updates into a trusted, current event plan.

The future-state experience, concretely:

A planner runs a recurring event — say the Q3 Client Networking Dinner.
Updates arrive all day from everywhere: the venue emails about headcount,
the caterer texts a revised quote, a teammate drops vendor notes in chat,
a call with the AV company ends with three loose ends. Today that chaos
gets retyped into spreadsheets or lost. With Glenn, each fragment gets
captured in seconds — pasted, spoken, or forwarded — and Glenn does the
structuring. The planner's only job is a two-minute review habit: apply
the safe changes, answer the one thing Glenn wasn't sure about, dismiss
the misread. The plan is current by lunchtime, every number has a
receipt, and the whole team trusts the workspace instead of the person
with the most recent email.

### A day in the life (target experience)

**8:40 — Morning brief.** Maya opens the event. Command Center says:
"Since yesterday: 4 changes applied, 1 needs your answer. Final headcount
due in 6 days. Catering still trending over estimate." One glance, no
tab-spelunking.

**10:15 — Capture without retyping.** The venue's email lands; she
forwards it to the event's address (future channel). After a vendor
call she records a 40-second voice note: "City Blooms confirmed, $750
flowers and candles, delivery 3pm before guests, but I still need exact
timing and we should confirm the final design by Friday." Each capture
becomes one review batch — she does nothing else.

**11:30 — The two-minute review.** Ask Glenn shows one batch: a vendor,
a cost, a timeline item ready to apply; one question ("exact delivery
timing?") already drafted; a follow-up task with a Friday due date.
"Apply 4 safe changes" — one click. She answers a needs-check inline.
Done. Nothing applied silently; nothing retyped.

**14:00 — Trust under pressure.** Her director asks where the $750
floral number came from. She clicks the AI-source badge on the budget
line: the drawer shows the voice-note excerpt, when, who applied it,
and what it replaced. The plan defends itself.

**Event week — Run of Show.** The timeline view flips from planning
deadlines to the day-of schedule. The floral delivery, AV load-in, and
guest arrival sit in one sequence, each tied back to its vendor.

What this experience optimizes: seconds-to-capture, minutes-to-current,
zero retyping, receipts on demand, and Glenn directing attention
("what changed, what's blocked, what's next") instead of the user
patrolling tables.

## 2. Future Information Architecture

### Top level — stable, already correct

- **Dashboard** — pick or create an event. Nothing else.
- **Command Center** — briefing and routing. Never duplicates Plan data.
- **Ask Glenn** — capture + Review. The thread is capture history.
- **Plan** — source of truth for current records.
- **Activity** — event-wide audit. Receipts.

This won't change. All future IA work happens *inside* Plan and Review.

### Plan: from table tabs to user-language groupings

Current tabs (Tasks, Vendors, Budget, Timeline, Decisions, Risks,
Questions) are honest projections of database tables. They are
implementation views, not the product model. Target grouping:

| Future surface | Today's records | Notes |
|---|---|---|
| **Run of Show** | timeline_items | Two modes: planning deadlines vs day-of schedule (the `type` field already distinguishes). Calendar view exists. |
| **People & Partners** | vendors | Later: team members, key contacts. Each partner row expands to its linked costs, tasks, dates, questions (see §3). |
| **Costs** | budget_items | Vendor-linked via `vendor_id` (m17). Budget target + totals stay here. |
| **Follow-ups** | tasks | Assignment, due dates. Renaming guards against "generic task tracker" drift. |
| **Open Items** | open_questions + pending decisions | Merged: both are "unresolved, blocking plan completeness." Decided decisions become the read-mostly "Decided" filter here — the decision log. |
| **Watchouts** | risks | Kept separate from Open Items: risks are *monitored over time*, not closed by an answer, and Command Center treats them differently. |

So: 7 tabs → 6 groupings. The only true merge is Decisions + Questions →
Open Items. Activity/Receipts stays top-level, not a Plan tab.

**Internal only, never UX nouns:** messages, ai_runs, proposed_updates,
operation/supersedes fields, payload_json. Reviewers see "changes,"
"batches," and "receipts" — never rows, runs, or payloads.

**Tabbed vs component-based:** hybrid. Tabs remain the spine — they
answer "show me all costs" predictably. Component grouping arrives as a
cross-cutting affordance (partner rollups, package review cards), not as
a replacement canvas. Revisit a component-grouped default view only with
pilot evidence.

**When to rename:** not now. Renames are a config change once the
`TABS` array in `app/(app)/events/[eventId]/plan/page.tsx` allows one
tab to render multiple record types. Validate labels with pilot users
first; "Watchouts" and "Open Items" especially need real-user testing.

## 3. Atomic Records vs Planning Components

The recurring discovery: one real-world planning component spans many
records. "City Blooms floral package" = vendor + $750 budget item +
delivery timeline item + confirm-design task + delivery-timing question
+ cancellation risk. Internally these are six rows; to the user they
are one *thing*.

**Principle: records stay atomic internally; experiences group around
real-world components.**

### Is a `component` entity necessary? Eventually as an experience; not now as schema.

**What grouping would unlock:** component rollups ("Floral package:
$750, 2 open items, delivery 3pm"); package-level review (one decision
for a replacement storyline); robust cancellation cascades (FK-driven
instead of conservative text matching); a Run of Show grouped by
component; a credible "vendor engagement" view.

**What minting the entity now would risk:** extraction has to decide
component membership — a new failure mode in the most fragile layer;
review grows a second dimension (rows × components); users inherit
grouping chores (naming, merging, splitting components) — the place
where flexible-database tools die; and we'd lock in an abstraction
before any pilot shows how users actually group things.

### The lightest future-proof version (recommended)

1. **Vendor as the anchor (m17).** Most planning components are vendor
   engagements. Populate `budget_items.vendor_id` at approve time, and
   extend the same nullable-FK pattern to tasks, timeline_items,
   open_questions, and risks where extraction can attribute confidently.
   No new entity; the vendor *is* the component for ~80% of cases.
2. **Born-together threads.** `ai_run_id` / `source_message_id` already
   group records that arrived in one capture. Use them for "related
   changes" affordances; they cost nothing.
3. **UI before schema.** Build the partner rollup (vendor row expands to
   linked records) and package review cards first. If pilots love them
   and ask for non-vendor groupings ("VIP dinner segment" spanning
   caterer + AV + florist), that's the evidence for step 4.
4. **Only then:** an additive `components` table (id, event_id, name,
   kind) + nullable `component_id` on child records. Purely additive
   migration — possible at any time *because* records stayed atomic.

### How we avoid hard-coding the tab model

- Plan tabs are presentation config over record-type projections; the
  consolidated `/api/events/[eventId]/records/[recordType]` routes
  already point this way.
- Extraction, approval, and provenance logic never depend on which
  surface displays a record.
- New cross-record meaning enters as nullable links, never as schema
  restructuring.

## 4. Screen Responsibilities (future state)

### Dashboard
- **Goal:** pick or create an event in five seconds.
- **Belongs:** event cards with a one-line pulse — date, pending-review
  count, next deadline.
- **Doesn't belong:** cross-event analytics, org admin sprawl.
- **Change:** add the pulse line (a "2 to review" chip earns the click).
- **Stable:** its thinness.

### Command Center
- **Goal:** "what needs my attention in the next five minutes."
- **Belongs:** readiness status, event brief, needs-attention list,
  the capture input, recent-activity glimpse.
- **Doesn't belong:** full data tables, charts, anything Plan owns.
- **Change:** tighten density (known gap); frame as deltas — "since you
  last looked"; every item deep-links to the exact record or batch
  (highlight routing already exists).
- **Stable:** capture is the first action, review the second.

### Ask Glenn
- **Goal:** capture messy input; host Review. Not a chatbot.
- **Belongs:** capture thread (the receipts feed), Glenn's batch
  replies, guided intake for new/empty events, inline clarifications.
- **Doesn't belong:** free-form Q&A, plan browsing, long Glenn essays.
- **Change:** first-open welcome grows into guided intake
  (create-to-intake, m22); channel chips on thread entries when
  channels arrive (m23).
- **Stable:** review-before-apply lives here; prose-only replies.

### Review (inside Ask Glenn)
- **Goal:** decide a batch in under a minute.
- **Belongs:** Ready / Needs-answer / Removals triage; "Apply N safe
  changes" as the hero action; before→after diffs for corrections;
  deliberate friction on removals.
- **Doesn't belong:** field-by-field editing of every row; stacked
  stale batches (supersession solved this in m16); payload-shaped
  field names.
- **Change:** coordinated packages (m18) — replacement and cancellation
  storylines render as one card with one decision, row-level override
  preserved; rows compress to one line, expand on demand; copy says
  what changes in the plan, not what the record contains.
- **Stable:** nothing applies silently; removals stay row-deliberate.

### Plan
- **Goal:** the current truth, trusted at a glance.
- **Belongs:** current records, inline edits/status changes, AI-source
  badges, archived records excluded everywhere.
- **Doesn't belong:** pending proposals (Review owns them), stale or
  duplicate rows — staleness here is a P0 bug, not polish.
- **Change:** "current as of" framing (last-applied timestamp); partner
  rollups (m24 spike); later, the §2 grouping relabel.
- **Stable:** single source of truth at `/plan`; provenance drawer
  opens from records in place.

### Activity
- **Goal:** a credible audit trail a director would accept.
- **Belongs:** who/what/when, changed-field lines, applied-vs-manual
  attribution, supersession entries, links back to records.
- **Doesn't belong:** chat messages, AI internals (run IDs, model
  names), unexplained system entries.
- **Change (m20):** group by day and by batch; humanize ("Maya applied
  4 changes from Tuesday's catering note"); filter by record type and
  actor.
- **Stable:** append-only honesty; entries link to records.

### Provenance drawer
- **Goal:** answer "where did this number come from" in one glance,
  in plain language.
- **Belongs:** source excerpt first (the quote is the receipt), channel
  + time, Glenn's rationale, before→after, approver, record history.
- **Doesn't belong:** ai_run IDs, JSON, confidence scores, model names.
- **Change (m20):** lead with the source quote; history as plain
  sentences; channel labeling ready for m23.
- **Stable:** opened from the record, in place.

### Cross-cutting: fewer clicks
Deep-link everything (Command Center → exact batch/record with
highlight); answer and edit inline instead of navigating; one click for
safe batches; never make the user transcribe between surfaces.

## 5. Capture Channels (future)

Planned channels: voice notes, forwarded email, SMS, meeting
transcripts, eventually call intake.

### Architecture: adapters into one loop

Every channel terminates in a `messages` row and nothing else:

    channel adapter → messages (channel, channel_metadata_json)
      → extract-updates → proposed_updates → Review → Plan + Activity

Identical from web paste to phone call. No channel gets its own
pipeline, queue, record types, or apply path.

### Schema additions (land with the first channel, m23)

- `messages.channel` — 'web' | 'voice' | 'email' | 'sms' |
  'transcript' | 'call'
- `messages.channel_metadata_json` — sender address/number, subject,
  duration, external IDs
- `files` (table exists) — audio blobs, attachments, transcripts;
  message links to its file
- Activity + provenance read channel from the message — no new columns.

### UI treatment

- Channel chip on Ask Glenn thread entries ("voice note · 0:40").
- Provenance drawer leads with it: "From a voice note · Jun 12,
  2:14 PM," then the transcript excerpt.
- One capture thread. Never per-channel inboxes.

### Trust boundary

Content from non-members (a vendor's forwarded email) is third-party
material: the capturing member is the attributed actor, the external
sender is metadata. External content never gets elevated trust and
never relaxes review. Email ingestion is a sensitive feature
(PRODUCT_SOUL §14) — inbound addresses are per-event and revocable.

### Ordering and prerequisites

1. **Voice (m23):** in-app, authenticated, no external infra — browser
   recording + transcription into the existing pipeline.
2. **Forwarded email:** needs deployment (m19) for an inbound webhook
   and invite (m21) for sender mapping.
3. **SMS:** Twilio + number provisioning; after email proves the
   adapter pattern.
4. **Transcripts:** paste already works today (a transcript is just
   long messy text); file upload is the later convenience.
5. **Call intake:** last; it's voice + telephony once both are proven.

**Avoid:** any channel before the loop is deployed and reliable;
auto-apply for "trusted" channels; channel-specific extraction schemas;
per-channel review queues.

## 6. Roadmap — next branches

| Branch | Goal | Why now | Agent |
|---|---|---|---|
| **m17-entity-consistency-2** | `vendor_id` populated at approve time; replacement clusters share linkage; task-level cascade follow-ups | Foundation for all component grouping; replaces text-matching fragility | Claude/Fable |
| **m18-coordinated-review-packages** | Replacement/cancellation storylines render as one package card with one decision | Review overwhelm is the top UX risk; m15/m16 already create linked rows that render flat | Claude/Fable |
| **m19-deployment-readiness** | Netlify + hosted Supabase, all migrations, fresh seed, Sentry verified, demo arc smoke-tested on the deployed URL | Pilots, invite, and every future channel are blocked on a URL | Human + Codex-capable (docs/DEPLOYMENT.md is the spec) |
| **m20-activity-provenance-polish** | Activity grouped by day/batch, humanized lines, filters; drawer leads with source quote | Credibility surfaces sell the trust story in pilots; well-specified | Codex |
| **m21-team-invite** | Invite flow for event_members; profiles RLS widened to event-mates | Multi-user is the product premise; approver/assignee names currently don't resolve | Claude/Fable (RLS care) |
| **m22-create-to-intake** | Minimal create form → guided Ask Glenn intake as the first-run | The funnel into the loop; welcome + checklist already exist; salvage from fable-production-mvp-run | Claude/Fable |
| **m23-voice-notes** | Record → transcribe → same pipeline; `messages.channel` + metadata migration | First channel; proves the adapter contract end to end | Claude/Fable |
| **m24-component-rollups-spike** | Partner row expands to linked records (m17 FKs); pilot-feedback notes on grouping + labels | The §3 UI-before-schema proof; informs the §2 relabel; no renames yet | Claude/Fable (exploratory) |

Ordering note: swap m18 ↔ m19 if a pilot date gets fixed first.
Acceptance criteria per branch live in the checkpoint when each starts.

## 6.5 Visual Day-of Calendar — design direction (feeds m25-visual-run-of-show)

Owner-validated visual direction for the **Run of Show** experience (June 2026).
Full prototype saved at **`docs/reference/day-of-calendar-mockup.md`** (a
non-production reference — inline styles + bespoke palette; real work must use the
"Operations Desk" tokens and the existing `day-of-grid.tsx` / `timeline-calendar.tsx`
/ `record-detail-drawer.tsx`).

**What the owner liked (carry these over):**
- A **Google-Calendar-style day column** for *Day of*: colorful timed blocks
  positioned by clock time, **overlaps shown side-by-side** (e.g. AV check vs.
  cocktail arrival; exec remarks nested inside dinner service). Fast and
  glanceable, not a list.
- A **hard-constraint line** across the grid — a red marker like
  "MD departs 8:15" the schedule must respect.
- **Left calendar + right context panel** split. The panel in the mockup holds
  *Hard constraint*, *Overlaps to watch*, and *Source*. Owner likes related
  notes beside the calendar but is **unsure what the panel's ideal contents
  are** — treat the panel's contract as an open question.
- A **lead-up month** with Gantt-style **bars for multi-day work windows**
  (vendor work, open/not-started work, multi-day tasks) plus single-day
  deadline / submit-by chips.
- A **reusable detail drawer**: kind badge, time, location, description, **linked
  records**, **AI source** (confidence, or "flagged — needs your answer"), and
  **Edit / Tell Glenn** actions.

**How this maps to what exists today:**
- The **Day of** and **Lead-up** views already ship (`day-of-grid.tsx`,
  `timeline-calendar.tsx`) with overlap columns and an "overlaps to watch" list
  — this direction is a *visual + context upgrade*, not a from-scratch build.
- A `record-detail-drawer.tsx` already exists; the mockup's drawer is a richer
  superset (confidence + linked records).

**Open questions / placement (owner is undecided):**
1. **Home:** keep this under **Plan → Run of Show** (the `Day of` / `Lead-up`
   toggle), which is the current home — recommended — vs. promoting it elsewhere.
2. **Right panel contract:** what it should always show (hard constraints,
   overlaps, source?) and the **minimum fields per timed block** (title,
   start/end, type/color, source are the floor; location optional).

**Data-model prerequisites (previously deferred in Phase 2 — required before build):**
- **Hard constraints** as first-class data (so "MD departs 8:15" is a record,
  not prose) to drive the red line + the panel.
- **Work-window fields** (start/end on the relevant records) to render the
  lead-up multi-day **bars**.
- A **relationship store** to populate the drawer's "linked records" across types.
- **Confidence** surfacing: `ai_runs` telemetry exists (model/tokens/cost from
  migration 011); a per-record confidence to display may need to be derived or stored.

MVP stays **read-only** (consistent with §0's "Visual Run of Show … MVP
read-only; drag/edit later").

## 7. Design Principles

1. **Glenn never silently changes the plan.** Every Glenn-originated
   mutation passes review. (A user's inline edit is the user acting,
   not Glenn.)
2. **The Plan is the current truth.** Pending lives in Review; archived
   and superseded leave the Plan but never leave history.
3. **Every fact has a receipt.** Any record answers "where did this
   come from" within two clicks, in plain language, led by the source
   quote.
4. **Records are atomic; experiences group around real-world
   components.** Tabs and tables are projections, never the product
   model. New meaning enters as links, not restructuring.
5. **Channels are adapters.** Every capture path lands in the same
   messages → extract → review loop. No channel pipeline, no channel
   trust shortcut.
6. **Review is a habit, not a chore.** A batch decides in under a
   minute. If review feels like data entry, extraction or grouping has
   failed — fix that, don't add review features.
7. **Uncertainty becomes an open question, never an invented fact.**
8. **Destructive is deliberate; additive is one click.**
9. **Trust degrades faster than it builds.** A stale row, duplicate, or
   wrong number in the Plan is a P0 bug.
10. **Ship only what strengthens the loop** (PRODUCT_SOUL §17 test).

## 8. Risks and Anti-patterns

- **Generic task-tracker drift** — tasks quietly become the product.
  Guard: capture-first framing, "Follow-ups" naming, watch the ratio of
  Glenn-originated to hand-entered records.
- **Database-as-UX** — tab-per-table forever; payload field names in
  review cards. Guard: principle 4; review copy describes plan changes.
- **Chat creep** — Ask Glenn becomes Q&A ("what's my budget?") and the
  thread becomes the product. Guard: thread is capture history; answers
  live in Plan; Glenn replies route, not essay.
- **Review fatigue** — over-extraction of trivia; ten one-line rows
  per note. Guard: dedupe, packages (m18), supersession, "Apply N safe
  changes" as the dominant gesture.
- **Fragile extraction** — silent prompt regressions. Guard: the
  regression harness (`npm run test:extract`) grows with every bug
  found; never-invent rules stay in the prompt.
- **Stale-record trust loss** — duplicates and orphans after
  corrections/cancellations. m15/m16 closed the known holes; m17
  cascades close the rest. Treat recurrences as P0.
- **Channels before reliability** — email/SMS amplify garbage-in.
  Deployment, invite, and a boringly reliable loop come first.
- **Premature relationship graph** — minting components/graphs before
  evidence. Guard: §3 ladder — vendor anchor, then UI rollups, then
  (maybe) an entity.
- **Mobile neglect** — capture happens on phones in the field; channels
  make mobile primary. Capture + review must be mobile-good before m23.
- **Cross-event sprawl** — org dashboards, portfolio analytics. The
  dashboard stays thin.

## 9. Non-Goals

Unchanged from PRODUCT_SOUL: not a generic PM tool, chatbot, analytics
dashboard, RSVP/ticketing platform, seating tool, vendor marketplace, or
payments product. No autopilot AI — Glenn never applies without review.
No undo system — archives, supersession, and activity are the safety
net. No feature ships that doesn't strengthen the core loop.
