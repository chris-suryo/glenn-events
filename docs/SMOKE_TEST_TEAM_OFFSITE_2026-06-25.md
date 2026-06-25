# Glenn Events — Live Smoke Test Report (Core Loop + Correctness Probing)

**Date:** 2026-06-25
**Branch:** main @ 0a278e1
**Method:** Tester drove the UI (Vercel prod build, hosted Supabase); observer (Claude) verified every step against the hosted DB (project `foscibergjhdwqkpsxip`), read-only, via SQL. Real Claude extraction (live `ANTHROPIC_API_KEY`), `NEXT_PUBLIC_SHOW_AI_DEBUG=true`.
**Event under test:** "Team Offsite" — id `ef204a5b-3d46-4447-9676-e453a44a70ed`.

> Audience: the builder/other Claude session with full repo context. All findings below are **DB/UI-verified** (every claim was checked against the hosted DB via SQL or seen in the UI). File-path pointers were checked to **exist** in the repo, but internals were read directly only for `setup-wizard.tsx`, `onboard/route.ts`, and `create-event.ts`; other pointers (and any named functions) are best-effort leads from observed behavior + CLAUDE.md — verify before relying on exact line/function names.

---

## TL;DR

The **core loop is solid**: extraction fidelity, the review gate, grouping, and provenance all work and should be protected. The session then probed correctness hard and surfaced **a cluster of date/dedupe/CRUD defects** — several high severity. The single biggest root cause: **the extraction prompt is not given today's date**, so Glenn defaults dated values to **2025**. Stating the year explicitly fixes it. The second systemic issue: **the plan is append-only — there is no manual create and no delete** anywhere in the UI (Glenn-mediated archive exists but mis-targets), so a bad/duplicate row the user approves is effectively stuck.

---

## CAMPAIGN PROGRESS (live — maintained by the verifier session)

Builder↔verifier hardening loop. Status by batch:

| Batch | Defects | Status | Verified at |
|---|---|---|---|
| 1 — date injection | D4, D10 | ✅ verified | `0e06919` — `npm run test:dates`, haiku |
| 2 — reply integrity | D16b, D3, D11 | ✅ verified | `9a82f3f` — `npm run test:reply`, haiku |
| 3a — timezone write path | D5 | ✅ conversion verified headless; DB round-trip pending app-on-`d2a4e8d` + migration 017 | `d2a4e8d` — `npm run test:tz` |
| 3b — display day-bucketing | D15b | ✅ `eventDayKey` verified headless; UI spot-check pending | `267b0bf` — `npm run test:tz` |
| 3c — Edit-dialog time field | D15a | ⏳ next (UI spot-check) | — |
| 4 — manual CRUD + id-based archive | G1, D14 | ⏳ planned | — |
| 5 — supersession + dedupe + open-Q reconcile | D8, D6, D9 | ⏳ planned | — |
| 6 — partial-patch + budget cost-of-record + brief | D1, D2, D17, D12 | ⏳ planned | — |
| 7 — polish | D7, D13, G2 | ⏳ planned | — |

**Open watch items** (model-judgment / not gated): D16a — model intermittently *misses* an explicit instruction (post-Batch-2 the reply at least stays truthful about it); `lib/ai/llm-extract.ts:720` no-items fallback still says "I saved your note" (honest — note saved, plan not — but uses "saved", inconsistent with the D3 rule).

**Verification reach:** extraction-layer batches are checked **headless** (`scripts/verify-dates.ts`, `scripts/verify-reply.ts`). The Batch 3 timezone **write path** is NOT headless-reachable — it needs a DB round-trip + a UI spot-check. Builder owns the offline gate; verifier owns behavioral verification at a named commit.

---

## PRIORITIZED FIX LIST (for handoff)

Ranked by leverage. IDs link to the detailed defect entries below.

| # | Fix | Why it's top | Defects |
|---|---|---|---|
| 1 | **Inject today's date (+ event tz) into the extraction prompt** | Single highest-leverage change. Eliminates the wrong-year cascade and relative-date errors; confirmed that stating the year fixes it. | D4, D10 |
| 2 | **Fix timezone on WRITE + on event-date display** | Times/dates land on the wrong day everywhere (extraction, edit, event header). Wall-clock must be interpreted in the event tz before persisting `timestamptz`; `event_date` should be a calendar date or tz-resolved. | D5, D15 |
| 3 | **Add manual create + delete per plan table** | Append-only plan + mis-targeting archive (D14) means users can't fix bad data. Archive-by-description is not a safe substitute. | G1, D14 |
| 4 | **Generate the chat reply from the actual proposal set** | Reply claimed a task it never created (D16) and says "Saved" for review-gated items (D3) — directly erodes trust in the gate. | D16, D3 |
| 5 | **Make updates partial-patch + apply supersession uniformly** | Full-payload updates clobber unmentioned fields (D1); supersession works for decisions but not event_detail/task/budget, so duplicates pile up (D8). | D1, D8 |
| 6 | **Reconcile cost-of-record + brief accuracy** | Vendor cost goes stale vs budget after a correction (D2); the AI brief then sums the stale vendor total and contradicts its own stat card (D17). | D2, D17 |
| 7 | **Dedupe on stable entity keys, not title text** | Title drift duplicated the timeline + decision; restatements duplicate. | D6 |
| 8 | **Reconcile open questions on answer** | Answering "what's the date" leaves the question open and surfaced on the Overview. | D9 |
| 9 | **Show full dates (with year) on event-detail review chips** | Year hidden → indistinguishable 2025 vs 2026 proposals → caused an accidental wrong approval. | D7 |
| 10 | **Don't fabricate unstated rows; add budget step to wizard; fix `\n` rendering** | Lower-severity polish. | D13, G2, D11, D12 |

---

## What WORKS — protect these (do not regress)

1. **No-fabrication discipline.** With no event date in the note, Glenn refused to invent one — left timeline `starts_at` NULL, task `due_date` NULL, and *raised an open question* ("What is the event date?") instead. No phantom date, no phantom vendor, exact costs.
2. **Review gate holds for BOTH inserts and updates.** Every proposal (incl. corrections) waits as `pending` until explicit apply. Confirmed a correction was applied 14.6s after creation by a human reviewer (not auto-applied), despite the "Saved" reply copy (see D3).
3. **Grouping into per-component tiles** (`group_label`) with block-apply — Lakeside Pavilion / Green Fork / Afternoon Activity / General.
4. **Full provenance** on every applied row: `proposed_update_id` + `source_message_id` + `ai_run_id` all populated → backs the "AI source" badges. `activity_log` records `proposed_updates_created` + `proposed_update_applied`.
5. **`event_detail` high-stakes path.** Event-date change surfaces in its own indigo "Event Details · Approve one at a time" section, separate from safe tiles, with a dedicated Approve.
6. **In-place correction (dedupe on stable key).** "$1,500" correction → `operation: update` against the existing budget row, no duplicate (budget stayed 2 lines).
7. **No-op / restatement recognition.** Re-stating an already-applied fact ("Lakeside Pavilion booked at $3,000") produced **zero** proposals — Glenn recognized it already exists.
8. **Timezone DISPLAY** in review tiles is correct (noon shows as 12:00 PM). (The WRITE path is broken — see D5.)
9. **Trust affordances**: "Why Glenn suggested this" rationale + Changed/Preserved diffs in the review tiles, and a "View source" link per batch.

---

## DEFECTS

### D1 — (HIGH) Correction overwrote a field the user didn't mention (fabrication-on-update)
Correction "actually Green Fork came down to $1,500" rewrote the budget line description **"Green Fork catering quote" → "Lunch delivery at noon"** (regenerated from the *original* note's context) and **dropped the `(Vendor reference: Green Fork)` suffix** the insert path appends. Amount correct; label now wrong/mislabeled in the plan.
**Likely areas (verified to exist):** update-payload generation in `lib/ai/llm-extract.ts` (LLM re-emits a *full* payload incl. a fresh description); apply path `lib/ai/apply-proposed-update.ts` + the branch in `app/api/updates/[id]/approve/route.ts` (patches all payload fields vs only changed; doesn't re-apply the vendor-ref suffix); correction-target resolution in `lib/ai/run-extraction.ts` and dedupe matching in `lib/ai/dedupe.ts`.
**Fix direction:** updates should patch only the corrected field(s), preserve untouched fields, and re-apply the vendor-reference suffix convention.

### D2 — (MED) Linked vendor cost goes stale after a budget correction
After the $1,500 budget correction, the **Green Fork vendor row still says $1,800**. Budget and Vendor now disagree on the same quote. Correction only emitted a `budget_item` update.
**Decision needed:** should a cost correction update both the budget line and the linked vendor (shared `vendor_name`)? Either link/sync them or make the model/UX explicit about which record holds cost.

### D3 — (LOW/UX) Inconsistent assistant reply tone for corrections
First note: *"I won't touch the plan until you approve."* Corrections: *"Saved — here's what I pulled out of that…"*. "Saved" implies it already persisted (it did not — gate held). Erodes the review-gate mental model.
**Likely area:** `lib/ai/compose-reply.ts`.

### D4 — (HIGH) Wrong YEAR — extraction prompt has no current-date awareness  ⭐ root cause
"Friday, September 18" → Glenn produced **2025-09-18** (9 months in the past; not even a Friday in 2025) for `event_date`, plus task due `2025-09-12` and timeline `2025-09-18`. **Confirmed root cause:** explicitly saying "2026" made Glenn produce `2026-09-18` / task `2026-09-11` correctly. So Glenn defaults to a training-era year and cannot use the weekday the user gave to disambiguate.
**Fix direction:** inject "today's date" (+ event timezone) into the extraction system prompt; teach it to resolve relative/under-specified dates against today. Affects `lib/ai/llm-extract.ts`.

### D5 — (HIGH) Timezone bug on WRITE — naive datetime stored as UTC
Timeline payload `starts_at: "2025-09-18T12:00:00"` (naive, no offset) was persisted as **`2025-09-18 12:00:00+00`** (UTC). The event timezone is `America/New_York`, so noon-local was stored as noon-UTC → renders as **8:00 AM** in the event zone, not 12:00 PM. Violates CLAUDE.md decision #8 on the insert side (review tile displayed the naive "12:00 PM", masking it).
**Fix direction:** interpret extracted wall-clock times in the event's timezone before persisting to `timestamptz` (apply the zone offset on write, mirroring `formatEventDateTime`/`parseTimelineDateValue` on read).
**CONFIRMED VISIBLE end-to-end (edit path, step 11):** editing the timeline date to `09/18/2026` stored `starts_at = 2026-09-18 00:00:00+00`, which renders in `America/New_York` as **2026-09-17 20:00 (8:00 PM, Thursday Sep 17)** on the Day-of Run of Show — wrong day *and* wrong time (should be noon Fri Sep 18). So D5 hits both the extraction-write path AND the manual-edit path.

### D15 — (MED) Timeline Edit dialog is date-only (no time field) + calendar vs Day-of disagree on the day
(a) The Edit timeline dialog exposes **Starts/Ends as date-only** — there's no time-of-day input, so any existing time (e.g., noon) is silently dropped to midnight on save, and a user cannot set a time manually at all. Combined with D5, times are unsettable/wrong on both the extraction and edit paths.
(b) For the same stored timestamp (`2026-09-18 00:00 UTC`), the **lead-up calendar** renders it on **Sep 18** (uses the UTC date component) while the **Day-of panel** renders it on **Sep 17 at 8 PM** (applies the event tz). Two views of one row disagree about the day.
**Fix direction:** add a time input to the Edit dialog; make calendar and Day-of use the same tz-aware resolution (`parseTimelineDateValue(value, timeZone)`).
**ALSO (step 13):** D5 hits the **event's own date display**. `events.event_date` stored `2026-09-18 00:00:00+00` renders on the **Overview header** as **"Thu, Sep 17, 2026 at 8:00 PM"** (+ a "in 84 days" countdown off the wrong day) — the event's headline date is shown a day early with a spurious 8 PM time. Most user-visible D5 instance. (`events.event_date` is a `timestamptz` holding midnight-UTC; it should be a calendar date, or be resolved in the event tz for display.)

### D16 — (HIGH) Explicit instruction missed; reply over-claims an action it didn't take
Note: *"Let's lock the save-the-date deadline — we'll send it by Friday, August 14, 2026."* Expected: a `task` update setting `due_date = 2026-08-14`. **Actual: the note produced ZERO task updates** — its only proposal was a **duplicate `decision` insert ("Kayaking")** for an already-decided/applied decision. The save-the-date `due_date` remains `null`.
Worse: Glenn's **conversational reply claimed** *"• Task: Send save-the-date by Friday, August 14"* — describing a structured update that **was never created**. The reply narrates actions that didn't happen.
**Two defects in one:** (a) missed the primary, unambiguous instruction; (b) reply/action mismatch (trust-eroding — the chat says it did something the review queue doesn't contain). Likely the prior kayaking context bled into this extraction.
**Fix direction:** ensure the reply is generated from the actual proposal set (never describe updates that weren't produced); investigate why an explicit "set due_date to <date>" on an existing task yielded no task update.

### D17 — (MED) AI Brief reports the wrong spend (uses stale vendor sum) and contradicts the stat card
Generated brief: *"…catering and venue locked in at **$4,800**…"*. Actual active **budget** total = **$4,500** (Grand Hall $3,000 + lunch $1,500). **$4,800 = the active *vendor* `estimated_cost` sum** (Grand Hall $3,000 + Green Fork **$1,800**, the stale D2 cost). So the brief (a) sums the wrong table (vendors, not budget), (b) inherits the stale D2 cost, and (c) **contradicts the "Est. budget $4,500" stat card** shown directly below it on the same screen.
**Brief positives (worth noting):** got the date right in prose ("Sep 18, 2026"), correctly said "no budget target defined" (G2), did **not** leak the archived Lakeside venue, and the "2/2 vendors confirmed" stat correctly excludes the archived vendor.
**Fix direction:** brief should total the budget table (active rows) and reconcile cost-of-record with D2; brief and stat card must agree.

### D6 — (MED) Dedupe is brittle — matches title/entity text, not a stable reference
- Worked: vendor name ("Lakeside Pavilion"), budget correction, no-op restatement.
- Failed: **timeline duplicated** when title drifted "Green Fork catering delivery" → "Green Fork lunch delivery"; **decision re-emitted as a new insert** (2 pending decisions for the same hike-vs-kayak choice).
**Fix direction:** match on a stable entity key (e.g., group_label + type, or a durable external id) rather than title similarity; cover the *insert-vs-already-applied-record* case, not just corrections.

### D7 — (MED) Event-date review chip hides the YEAR
Both competing event-date proposals rendered identically as **"Event date: Not set → Sep 18"** — no year. The 2025 and 2026 proposals were indistinguishable in the queue. This directly caused an accidental wrong-approval during the test. The highest-stakes field omits the very part (year) most likely to be wrong.
**Fix direction:** show full, unambiguous dates (with year) on `event_detail` review chips.

### D8 — (MED) Supersession is implemented but applied INCONSISTENTLY
`supersedes_proposed_update_id` **is** used — confirmed on the **decision resolution** (step 12: the "decided: Kayaking" proposal has `supersedes = true` and reconciles the prior pending hike/kayak decision). But it was **NOT** used on the event-date / task / budget re-proposals (all `supersedes = false`), so those stacked as competing duplicates in the queue (2 event-date + 3 task + 2 decision proposals accrued before cleanup).
**Refined finding:** the mechanism exists and works for some update types and not others. **Fix direction:** apply supersession uniformly — whenever a new proposal targets a field/record that already has a pending proposal, supersede the stale one (extend the decision-path behavior to event_detail/task/budget).

### D9 — (MED) Open-question reconciliation missing
Glenn raised "What is the event date?" then the user *answered* it (set the date) — but the open question stays `open`. Answering a known open question doesn't resolve/close it.
**Fix direction:** on applying an `event_detail` (or a matching answer), reconcile/close the related open question.

### D10 — (LOW) "next Friday" mis-anchored
"Send the save-the-date by next Friday" (relative to *today*, ~2026-07-03) was computed as **event-date minus ~1 week** (Sept 11/12). Wrong anchor, independent of the year bug. Same fix family as D4 (date reasoning needs "today").

### D11 — (LOW/UX) Chat reply renders literal `\n\n`
Glenn's conversational replies show literal `\n\n` escape sequences instead of line breaks in the chat bubble. Markdown/newline rendering bug in the chat view.

### D12 — (LOW) Unrequested status change on correction
The $1,500 budget correction also flipped `status: estimated → committed`, which the user never stated. Minor inference overreach.

### D13 — (MED) Fabricated timeline item on venue switch
The venue-replacement note ("we booked The Grand Hall, same $3,000") produced an **invented** timeline item the user never mentioned: **"The Grand Hall setup"**, `starts_at 2026-09-18T00:00:00`, description "The Grand Hall available for offsite on September 18, 2026" — surfaced in the **safe** "Apply 3" tile (so it'd be applied with the legitimate vendor/budget). Notable because it breaks the otherwise-strong no-fabrication discipline (it inferred a venue-availability/setup milestone from nothing). Also a date-only with no real time → defaulted to **midnight (12:00 AM)**, recurring D5 (naive datetime → will persist as UTC midnight).
**Fix direction:** don't synthesize timeline/milestone rows that aren't stated; if a venue has an availability date, attach it to the vendor/event, not a fabricated "setup" milestone at midnight.

### D14 — (HIGH) Archive-by-description targeted the WRONG row
User: *"there are two Green Fork lunch timeline entries… one is dated September 2025, which is wrong. Remove that duplicate."* Glenn's own archive reason agreed (*"Duplicate entry with incorrect 2025 date; correct September 18, 2026 delivery timeline item retained"*), but it **archived the other row** — "Green Fork catering delivery" (no date, the original) — and **left the actual 2025-dated duplicate active**. The exact inverse of the request. The rationale is also hallucinated: it claims to retain a "September 18, 2026" item that **does not exist** (the surviving row is the 2025 one). **Already applied** (mis-fire is now persisted).
**This is the decisive answer to the removal-precision probe:** Glenn-mediated archive **cannot reliably disambiguate between similar rows** — it mis-targets and confidently mis-describes what it kept. Archive-by-description is therefore **not a safe substitute for a manual delete** → hardens G1.
**Fix direction:** removals must show the exact target (id + title + date) and the user must confirm against that concrete row; never resolve "the 2025 one" by guessing. And this is precisely why direct manual delete is needed.

---

## PRODUCT GAPS

### G1 — (HIGH) No **manual** create or delete (Glenn-mediated archive DOES work)
- **Create:** no "Add vendor / task / budget / timeline / open-item" anywhere — only Glenn extraction can create records.
- **Edit:** ✅ exists (e.g., Edit timeline dialog: Title/Description/Starts/Ends/Type).
- **Manual delete:** ❌ **absent.** The Edit dialog has Save/Cancel and **no Delete**. Confirmed live.
- **Glenn-mediated removal:** ✅ **works well** (validated — see step 9). Telling Glenn a fact is obsolete produces `operation: "archive"` proposals (soft-archive, `archive_reason` set, targets the existing row) shown in a dedicated **"Removals — confirm each individually, never applied in bulk"** section. A genuine, well-designed removal path.
**Refined gap:** the hole is specifically **manual** direct create/delete. A user cannot remove an accidental/duplicate row that Glenn won't naturally archive (e.g., the duplicate 2025 timeline from D5/D6) **unless they ask Glenn to remove it by description** (precision of that targeting still open — see step 10 if run). Recommend adding manual create + delete affordances per plan table anyway; archive-by-Glenn shouldn't be the only escape hatch.

### G2 — (MED) Setup wizard can't set a budget target
`components/event/onboarding/setup-wizard.tsx` steps: name → type → date → location → guests → capture. **No budget step;** `submitFull()` never sends `budget_target`, so events are created with `budget_target = NULL` even though `createEvent()` accepts it. (Confirmed: test event has `budget_target = NULL`.) Add a budget step, or document that budget target is set later via a Glenn `event_detail` update.

---

## OPEN QUESTIONS FOR THE BUILDER

1. **Inject current date (+ event tz) into the extraction prompt?** Fixes D4 and D10 — the highest-leverage change.
2. **Where does cost live — vendor, budget line, or both?** Drives D2. Should a cost correction sync both?
3. **Updates: partial patch vs full payload?** A full re-emitted payload is what clobbers descriptions (D1).
4. **Dedupe key:** move from title-text matching to a stable entity reference, covering insert-vs-existing (D6).
5. **Reconciliation:** should applying an `event_detail`/answer close related open questions (D9) and supersede stale pending proposals (D8)?
6. **Write-side timezone:** confirm the insert path applies the event zone offset before persisting `timestamptz` (D5).

---

## CURRENT TEST-EVENT DATA STATE (final, DB-verified at end of session)

Event `ef204a5b-3d46-4447-9676-e453a44a70ed`; `events.event_date` stored as **`2026-09-18 00:00:00+00`** (midnight UTC → displays as **Thu Sep 17, 8:00 PM** in the event tz, D5); tz `America/New_York`; `budget_target = NULL` (G2).

| Table | Active rows | Archived | Notes |
|---|---|---|---|
| vendors | The Grand Hall (Venue, $3,000) · Green Fork (Catering, **$1,800 — stale**, D2) | Lakeside Pavilion ($3,000) | venue switch applied; archived row excluded from "2/2 vendors" stat ✅ |
| budget_items | The Grand Hall rental $3,000 · "**Lunch delivery at noon**" $1,500 (**mislabeled**, was "Green Fork catering quote", D1) | Lakeside rental $3,000 | **active budget total = $4,500** (brief wrongly says $4,800, D17) |
| timeline_items | "Green Fork lunch delivery" @ **`2026-09-18 00:00 UTC`** (displays Sep 17 8 PM, D5/D15) | "Green Fork catering delivery" (no date) | the **wrong** row was archived (D14); the surviving active row is the formerly-bad one, date-fixed to 2026 but time lost to midnight |
| tasks | "Send save-the-date to team" — **`due_date = NULL`** (D16: never set; Aug-14 instruction missed) | — | |
| decisions | "Afternoon activity" = **Kayaking** (`decided`) ✅ | — | resolved correctly (step 12) |
| open_questions | "What is the event date for the offsite?" (`open`) | — | **unreconciled** despite date being set (D9) |
| proposed_updates | **24 total / 4 pending** | — | 4 stale pending (mis-anchored task dates + duplicate decisions) — not cleaned up |

---

## TEST STEPS RUN (chronological)

1. **Create event** (clean baseline) — PASS. All fields NULL as expected; no fabrication at creation.
2. **Paste messy note** → 8 proposals, all pending, correctly grouped; no-fabrication win; nuances on unresolved date/noon. — PASS.
3. **Approve 7 safe, leave decision pending** — PASS. Provenance intact; decision withheld.
4. **Correction "$1,500"** — dedupe PASS (in-place update, no dupe); surfaced D1, D2, D3.
5. **Set date "Friday, September 18"** — surfaced D4 (year=2025), D5 (UTC noon), D6 (timeline+decision dupes), D7 (year hidden), D8 (no supersede), D9 (open-Q not closed), D10 (anchoring), D11 (`\n`).
6. **Explicit "2026" probe** — confirmed D4 root cause (explicit year → correct). Accidental over-approval applied the duplicate 2025 timeline (D5/D6 in the plan now).
7. **CRUD check** — confirmed G1 (no delete in Edit dialog).
8. **No-op restatement (Lakeside)** — PASS. Zero proposals; confirmed dedupe works on stable keys (D6 nuance).
9. **Contradiction / venue switch ("Lakeside off, Grand Hall in, same $3,000")** — **strong PASS on removal/replacement.** Glenn proposed `operation: "archive"` for the Lakeside vendor + budget (soft-archive via `archived_at`/`archived_reason`, targets existing rows), inserted Grand Hall vendor + budget ($3,000), and surfaced removals in a dedicated **"Removals — confirm each individually, never applied in bulk"** section. Applied state confirmed clean: Lakeside vendor + budget `archived_at` set; Grand Hall active at $3,000; net active venue spend $3,000. Fabricated "Grand Hall setup" timeline (D13) was rejected by the tester. **Revises G1** (Glenn-mediated archive works).
10. **Removal-precision probe ("remove the duplicate dated Sept 2025")** — 🔴 **FAIL (D14).** Glenn archived the WRONG timeline row ("Green Fork catering delivery", no-date original) and left the actual 2025-dated duplicate active; rationale hallucinated a non-existent "2026" item. Already applied. Confirms archive-by-description can't disambiguate → archive is not a safe delete substitute. **Net timeline state now:** 1 active row = "Green Fork lunch delivery" @ 2025-09-18 12:00 UTC (the bad one); the good no-date row is archived.

11. **Edit timeline date 2025→2026 (fix the D14 leftover + test edit-write path)** — edit-write works (year now 2026) and the **Day-of Run of Show visual populated** (genuine strength — tester called it powerful). BUT **D5 confirmed visible**: stored `2026-09-18 00:00 UTC` → renders **8:00 PM Thursday Sep 17** in the event tz (should be noon Fri Sep 18). Also surfaced **D15** (date-only Edit dialog drops the time to midnight; calendar vs Day-of disagree on the day).

12. **Decision resolution ("we're doing kayaking, not the hike")** — ✅ **PASS, best reconciliation seen.** Proposal captured `status: decided`, `decision: "Kayaking"`; **`supersedes = true`** (reconciles the prior pending decision rather than duplicating); one earlier duplicate decision is now `rejected`; review-gated. Corrects/refines **D8** (supersession works here, just not on event_detail/task/budget).

13. **Explicit task due date ("send by Friday, August 14, 2026")** — 🔴 **FAIL (D16).** Note produced **no task update** (due_date still null); its only output was a **duplicate Kayaking decision** (already applied). Glenn's reply falsely claimed it created the Aug-14 task. Decision applied earlier is confirmed correct (`decisions` = 1, "Kayaking").
14. **Generate Overview Brief** — mixed. ✅ date correct in prose, no archived-venue leak, "no budget target" correct, vendor count excludes archived. 🔴 **D17**: brief says "$4,800" (active *vendor* sum incl. stale D2 cost) vs actual budget **$4,500** — contradicts its own stat card. 🔴 **D5 on event header**: shows "Thu, Sep 17, 2026 at 8:00 PM". 🔴 **D9**: Overview "Needs answer — What is the event date?" still surfaced though the date is set.

*End of session probes. Report complete — see PRIORITIZED FIX LIST near the top for handoff.*
