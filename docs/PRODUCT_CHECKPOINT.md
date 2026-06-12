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
RLS is self-only so teammates' names don't resolve).

**Missing, important:** timeline corrections ("lunch moved to 12:45" still
duplicates — the one hole in the loop); fresh seed/demo data; push/deploy
(all work is local); team invite.

**Explicitly later:** voice/email/SMS capture; conflict visualization;
undo/version history; Plan tab consolidation; notifications; integrations.

## Known Gaps & Demo Guidance

- Do NOT demo timeline corrections (duplicates until m15).
- Demo on desktop; mobile is usable, unpolished.
- Single-user demo only (no invite flow yet).
- Migration 008 must be applied to the demo database.
- If asked about voice/email: "Capture channels feed the same review loop —
  we're proving the brain first; channels are plumbing afterward."
- If asked about spreadsheets/event tools: "It replaces the retyping. Updates
  become a plan of record with receipts. It is not ticketing, RSVP, or
  seating software."

## Roadmap (branch-sized)

1. **m14-demo-hardening** — seed refresh with correction/archive history,
   MVP_DEMO_SCRIPT rewrite around the arc above, push to origin, m13 QA fixes.
2. **m15-timeline-corrections** — existing_timeline_items (with ids) into
   extraction context; operation/target_id on timeline tool schema;
   timeline_item in approve route CORRECTION_TARGETS (archive columns exist
   since 008); time-diff review rows; 2 harness scenarios.
3. **m16-deployment-setup** — Netlify + hosted Supabase, all migrations,
   Sentry verified, demo arc smoke-tested on the deployed URL.
4. **m17-team-invite** — invite flow for event_members + RLS migration
   widening profiles SELECT to event-mates (fixes approver/assignee names).
5. **m18-voice-notes** — first capture channel: browser record/transcribe →
   same extract-updates pipeline; add messages.channel.

Command Center and Plan-tab simplification are reactive backlog — only with
pilot evidence.

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

## Next Steps

1. Manual QA of m13 (script in session notes), merge to main.
2. m14-demo-hardening, then run the friendly demo.
3. m15 timeline corrections before any pilot.
