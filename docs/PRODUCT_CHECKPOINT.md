# Glenn Events — Product Checkpoint (June 2026)

## North Star

Glenn turns messy event updates into a trusted, current event plan.

The core loop everything serves:
1. Capture a messy update (note, email text, fragment)
2. Glenn proposes structured plan changes
3. The user reviews safely — nothing is applied silently
4. The user applies, clarifies, dismisses, corrects, or removes
5. The plan becomes current
6. Activity/provenance proves where every fact came from and what changed

Future capture channels (voice notes, forwarded email, transcripts, SMS) are
adapters that feed this same review-before-apply loop. They are never separate
products or pipelines.

## Current State (post M11B / M12 / M12B / M13)

The full fact lifecycle works end to end: facts can be **added, corrected,
and retired** through the same review gate, with provenance.

- Extraction: real LLM (claude-haiku-4-5) with event-state context, dedupe,
  and LLM-targeted corrections (operation/target_id validated server-side).
  12-scenario regression harness (`npm run test:extract`), all passing.
- Review: one batch card per Glenn reply; Ready / Needs-answer / Removals
  decision structure; "Apply N safe changes"; removals require a deliberate
  row-level action; latest batch expanded, older collapsed; inline
  clarification answers re-extract and supersede.
- Corrections/archives (M11B): budget price corrections ($700 → $300 diffs),
  vendor/budget soft-archive with reason, replacement as archive + insert.
  Archived records hidden from Plan and totals; nothing hard-deletes.
- Plan: single source of truth at /plan?tab=…, 7 record types, inline edits
  and status changes, archived records excluded.
- Provenance (M13): AI-source badge opens an in-place drawer — source
  message, Glenn's proposal + rationale, before→after diffs, removal reason,
  approver, record history. Activity entries link back to records in Plan.
- Stability: both known scroll-shell bugs fixed (chat thread, plan highlight);
  typecheck/lint/build clean.

## Demo Story (the 5-minute arc)

1. Open the seeded event → Command Center brief.
2. Paste a messy note → review batch: apply ready changes, answer one
   needs-check inline.
3. "DJ City gave me a discount, price is now $300" → correction row with
   $700 → $300 → apply → Plan shows $300, no duplicate.
4. "Harbor Lights DJ canceled, we're using DJ City instead" → deliberate
   removal + new vendor → vendor gone from Plan, replacement in.
5. Click "AI source" on the corrected budget item → provenance drawer.
6. Activity → click an entry back to the record.

## Capability Map

**Works well:** extraction + harness; review decision flow; apply/dismiss/
clarify; budget corrections; vendor/budget archive; replacement flow; Plan
routes; provenance data model; activity logging.

**Works, needs polish:** provenance drawer (awaiting manual QA); Activity
visuals; Command Center density; mobile throughout.

**Partial:** timeline conflict detection (LLM flags conflicts as proposals/
risks; no dedicated UX); replacement linkage (supersedes field unused; the
ai_run is the thread); multi-user (schema/RLS exist; no invite UI; profiles
RLS is self-only so teammates' names don't resolve); replacement-flow
linkage (vendor↔budget link is text-only until vendor_id population in m17;
archive-old + insert-new share only the ai_run thread).

**Missing, important:** timeline corrections ("lunch moved to 12:45" still
duplicates — the one hole in the loop); fresh seed/demo data; push/deploy
(all work is local); team invite.

**Explicitly later:** voice/email/SMS capture; conflict visualization;
undo/version history; Plan tab consolidation; notifications; integrations.

## Known Gaps & Demo Guidance

- Do NOT demo timeline corrections (duplicates until m15) or rely on
  cancellation cleaning up related timeline/task items (m15/later).
- Glenn replies are sanitized to prose-only as of m14 (the model occasionally
  leaked raw JSON into chat before that).
- Extraction failures now distinguish LLM errors (retryable "Glenn had
  trouble reading that note" — the saved message is cleaned up so retry
  doesn't duplicate) from unexpected errors; causes are logged server-side
  with an `extract:` prefix.
- Demo on desktop; mobile is usable, unpolished.
- Single-user demo only (no invite flow yet).
- Migration 008 must be applied to the demo database.
- If asked about voice/email: "Capture channels feed the same review loop —
  we're proving the brain first; channels are plumbing afterward."
- If asked about spreadsheets/event tools: "It replaces the retyping. Updates
  become a plan of record with receipts. It is not ticketing, RSVP, or
  seating software."

## Roadmap (branch-sized)

1. **m14-demo-hardening** (DONE on this branch) — prose-only Glenn replies
   (JSON-leak sanitizer + harness assertion), first-open Ask Glenn welcome,
   event description into extraction context, Activity credibility lines
   (changed fields + reviewed-vs-manual attribution), never-invent-times
   prompt rule, batch title polish, demo script rewrite.
2. **m15-entity-consistency-cancellations** (DONE) — timeline corrections and
   archive support, task status updates, vendor-cancellation cleanup
   proposals for related budget/timeline/task records (conservative text
   matching), stronger highlight.
3. **m16-stability-and-review-lifecycle** (DONE on this branch) — fixed the
   duplicate-reply streaming race (cancellable animation, refresh deferred to
   post-stream), extraction error observability (LLM failures return a
   distinct retryable message and clean up the saved user message; causes are
   logged server-side), and pending-proposal supersession: new batches retire
   stale pending rows via supersedes_proposed_update_id, with
   "Replaced by a newer suggestion" activity entries. Stale needs-answer rows
   and batch accumulation resolve through this.
4. **m17-review-state-reconciliation** (DONE) — pending-review reconciliation
   with `replaces_queued_id`.
5. **m18-coordinated-package-recall** (DONE) — replacement/cancellation
   storylines render and recall as one package; app-side completion for
   vendor + budget + timeline packages.
6. **m19-product-direction-event-library** (DONE — planning) — phone-first +
   Event Library direction pass. See `docs/M19_PRODUCT_DIRECTION.md`.
7. **m20-event-library-upload-extract** (DONE) — file upload → store in private
   `event-files` bucket → PDF/TXT extraction via the shared `runExtraction`
   pipeline → Review → provenance. Images source-only. Migration 009.
8. **m20b-event-library-activity-hardening** (DONE) — fixed file status stuck on
   "Reading…" (missing files UPDATE RLS policy, migration 010), Ask Glenn
   composer upload (shared `lib/upload-file.ts` + paperclip), derived Library
   card states (Ready/Applied/No-updates), and Activity source-batch grouping
   (file → Glenn proposed N → you applied N) with actor + source links.

**Near-term next: `m20c-ai-cost-audit`** — before screenshot/image (vision)
extraction, add durable per-run cost/usage logging (NOT a billing dashboard).
Track on `ai_runs` (or a sibling table): provider, model, input/output/total/
cache tokens, estimated USD, source type (text/pdf/image/file/chat), source
file id, event/user id, status, duration_ms, proposal count (accepted count
derivable later), error info. Rationale: image extraction multiplies token cost
and we need visibility into model choice and proposal yield first.

**Reconciled roadmap (post-M18, predates the M20 reprioritization — file upload
shipped ahead of deployment; see M19 doc §8 for original detail):**
1. **m19-deployment-readiness** — Netlify + hosted Supabase, migrations, fresh
   seed, Sentry verified, demo arc smoke-tested on the URL. *Do this next* —
   it unblocks phone-first use, documents, pilots, invite, and every channel.
2. **m20-entity-linking-vendor-anchor** — vendor_id at approve time (the
   component anchor); extend nullable-FK pattern where extraction is confident.
3. **m21-mobile-first-responsive-polish** — capture + review + Plan good on a
   phone before documents make mobile primary.
4. **m22-event-library-file-upload** — Stage 1: upload/store/link PDF + images.
5. **m23-document-image-extraction** — Stages 2–4: doc/image → source message →
   existing extraction → review → provenance leads with the file.
6. **m24-today-command-center-refresh** — merged "Today" landing (countdown,
   review count, attention, recent changes).
7. **m25-visual-run-of-show** — read-only day-of lane view from timeline_items.
8. **m26-guided-create-to-intake** — guided intake → lands in Ask Glenn.

Later: team invite + voice/email/SMS channels (after the URL exists);
client-request feasibility mode (a new mode, post-library); Command Center and
Plan-tab simplification (only with pilot evidence).

## Screen Responsibilities

- Dashboard — pick/create an event. Nothing else.
- Command Center — daily briefing, what needs attention, routing. Never
  duplicates Plan data views.
- Ask Glenn — capture messy input + host Review. The thread is capture
  history; not a free-form chatbot.
- Review — decide: apply, clarify, dismiss, remove. One primary action per
  batch; destructive actions get deliberate friction.
- Plan — source of truth. 7 tabs at /plan?tab=…. Provenance drawer lives here.
- Activity — event-wide audit log (not a message log). Entries link to records.
- Provenance drawer — record-scoped "where did this come from," opened from
  the record; links out to Ask Glenn and Activity.

## Non-Goals

Not a generic PM tool, chatbot, analytics dashboard, RSVP/ticketing platform,
vendor marketplace, or autopilot AI. Glenn never changes the plan without
review. No undo system (snapshots + activity are the safety net). No feature
ships that doesn't strengthen the core loop.

## Workspace & Playbooks

For session resume and branch closeout, start at `docs/WORKSPACE.md` (base of
operations), then this checkpoint. Cost telemetry spec + results live in
`docs/AI_COST_AUDIT.md`; repeatable demo/QA flows in `docs/DEMO_SCENARIOS.md`.
The Branch Closeout Checklist is in `CLAUDE.md`.

## Next Steps

1. **m19-deployment-readiness** — ship a hosted URL (the precondition for
   everything phone-first and document-related). `docs/DEPLOYMENT.md` is the spec.
2. **m20-entity-linking-vendor-anchor** — the component anchor.
3. Then the phone-first + Event Library arc (m21–m23). Full direction and
   rationale in `docs/M19_PRODUCT_DIRECTION.md`.
