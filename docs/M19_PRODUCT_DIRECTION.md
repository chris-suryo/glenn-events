# Glenn Events — M19 Product Direction

> Mobile-First Command Workspace + Event Library
> Written June 2026, post-M18. Planning only — no app logic, no migrations,
> no file upload, no UI redesign in this pass.
> Companion to `PRODUCT_SOUL.md` (identity), `PRODUCT_CHECKPOINT.md` (current
> state), and `FUTURE_STATE_PRODUCT_PLAN.md` (the path). This doc records a
> direction decision and reconciles the roadmap; the other two carry the
> concise summary.

Thesis (unchanged): **Glenn turns messy event updates into a trusted, current
event plan.** Core loop: *messy input → Glenn proposes structured changes →
user reviews → Plan updates → Activity/provenance receipts.* Everything below
is about new **input surfaces** and a **simpler shell** over that same loop —
not a new product.

---

## 1. Product Synthesis

**The core signal.** Two forces, one conclusion. (a) The planner lives on a
phone — out at venues, on calls with vendors, capturing in the field, not at a
desk with seven tabs open. (b) The richest raw material is **documents**:
itineraries, menus, contracts, screenshots — not just typed notes. Conclusion:
*the surface must get simpler and phone-native while the engine stays exactly
as atomic and trustworthy as it is today.* The feedback is not asking for new
capabilities so much as a new **center of gravity** — the phone — and a new
**capture channel** — documents and images.

**What should influence the near-term roadmap.**
- **Phone-first becomes a headline, not a guardrail.** Capture and review must
  be genuinely good on a phone before any document work makes mobile primary.
- **Documents are the next capture channel.** A PDF or image is just another way
  to produce a `messages` row that the existing extraction pipeline consumes.
  This is the single highest-leverage new idea because it reuses the entire
  proven loop (extract → review → Plan → provenance) with no new trust model.
- **A simpler mental model.** The 5-surface IA (Dashboard / Command Center /
  Ask Glenn / Plan / Activity) is honest but heavy on a phone. A 4–5 item shell
  centered on *Today / Ask / Plan / Library* reads faster.
- **Deployment is the precondition.** None of the above can pilot, and no
  channel (documents, email, voice) can exist in the field, without a hosted URL.

**What should wait.**
- **Client-request / feasibility mode.** Promising, but it is a *new mode* with
  its own surface and reasoning. It rides on top of a mature library + plan;
  it is not MVP.
- **Smart typed parsers** (contract-specific, menu-specific extractors). Stage 6
  of document intelligence — gated behind evidence that generic extraction on
  document text is insufficient.
- **Multi-folder / per-user file permissions** ("my folder / your folder /
  team folder"). The *organizing metaphor* people reached for, but it pulls
  toward Drive. Ship a single event-scoped library first; add structure only if
  pilots demand it.
- **Run of Show as a drag-and-drop scheduler.** The read-only day-of view is
  MVP; editing/conflict-resolution UI waits.

**What would make the product too broad.**
- A generic file store with sharing, versioning, and permissions → it becomes
  Dropbox with a chatbot.
- Treating the Event Library as a destination ("a place for files") instead of a
  **source** ("files Glenn reads"). The difference is the whole product.
- A second grouping abstraction (non-vendor "components/segments") minted before
  pilot evidence — see `FUTURE_STATE` §3.
- Any feature that fails the 30-second test: *a new planner should understand
  what Glenn is for in half a minute.* Capture mess → get a current plan with
  receipts. Everything must serve that sentence.

**How this fits the existing thesis.** Cleanly. Documents and images are
**adapters into one loop** — the same principle already written for voice/email/
SMS (`FUTURE_STATE` §5). Phone-first is the environment that loop runs in. The
Event Library is where document-sourced facts keep their receipt. Nothing here
contradicts "Glenn never silently changes the plan" or "records are atomic,
experiences group." It sharpens *where the mess comes from* and *what device
the planner holds*.

---

## 2. Refined Product Positioning

Starting point (given):

> "Glenn is a mobile-first event command workspace. Planners can dump messy
> notes, vendor updates, documents, and client requests into Glenn. Glenn turns
> them into a current run-of-show, vendor plan, budget, tasks, and receipts —
> all reviewed by the planner before anything changes."

Three sharpened variants:

**A. Practical / professional**
> Glenn is a mobile-first command workspace for event planners. Capture anything
> from the field — notes, vendor messages, contracts, menus, screenshots — and
> Glenn turns it into a current run-of-show, vendor plan, budget, and task list,
> with a receipt on every change. You review before anything updates. The plan
> stays current; the busywork disappears.

**B. Warmer / friendlier**
> Planning happens on your feet — at the venue, on the call, mid-walkthrough.
> Glenn is the teammate you hand the mess to. Snap a contract, paste a text,
> forward a quote; Glenn drafts the updates and waits for your okay. Your plan
> stays current without you ever retyping a thing, and every number can show its
> work.

**C. Investor / concise**
> Glenn is the system of record for event operations. Planners capture messy
> field input — notes, messages, documents — on their phone; Glenn structures it
> into a reviewed, current plan with full provenance. One review-before-apply
> loop, every input channel an adapter into it. We're building the trusted
> operational brain small event teams retype today.

Recommendation: lead external copy with **A**, use **B** in-product (onboarding,
empty states), keep **C** for decks. All three hold the non-negotiables:
mobile-first, document capture, review-before-apply, receipts.

---

## 3. Future IA / Navigation Concept

Three models compared.

| | Model A — Current | Model B — Phone-first minimal | Model C — Hybrid (recommended) |
|---|---|---|---|
| Top level | Dashboard · Command Center · Ask Glenn · Plan · Activity | Today · Plan · Ask Glenn · Files | Today · Ask Glenn · Plan · Event Library · Activity |
| Landing | Dashboard → event → Command Center | Today | Today |
| Receipts | Activity (top-level) | folded into records/provenance | Activity (kept, demoted on mobile) |
| Documents | none | Files | Event Library |
| Read on a phone | heavy (5 + nested) | very light | light |

**Model A** is honest but tab-heavy; "Dashboard" and "Command Center" are two
landings that compete on a phone. **Model B** is the cleanest but drops Activity
as a destination — acceptable on mobile (provenance lives on records) but a loss
for the "a director would accept this audit trail" story.

**Recommendation: Model C.**
- **Today** = the merged landing. Replaces Dashboard + Command Center: countdown,
  what changed, what needs review, what's next. (See §7.)
- **Ask Glenn** = capture + Review, unchanged in role.
- **Plan** = source of truth, unchanged.
- **Event Library** = documents/images as sources (the "Files" people asked for,
  but framed as sources, not storage). (See §4.)
- **Activity** = stays in the IA for audit credibility, but on a phone it's
  reachable from Today/records rather than a constant bottom-tab.

**Non-negotiable constraints (restated so implementation can't drift):**
- **Backend records remain atomic.** This is purely a *shell relabel*; no record
  type changes.
- **UI may group records into sections/packages**; grouping is presentation.
- **No future label is hard-coded into business logic.** Extraction, approval,
  and provenance never reference "Today," "Library," or any surface name.
  Surfaces are config over record-type projections (`FUTURE_STATE` §3, the
  `/api/events/[eventId]/records/[recordType]` routes already point this way).
- This **evolves** `FUTURE_STATE` §2's "Top level — stable, already correct"
  claim: the *responsibilities* are stable; the *phone-first packaging* of them
  is the new decision. Do not rename in code until pilots validate labels.

---

## 4. Event Library Concept

**What it is.** An event-scoped place where uploaded **documents and images
become linked sources of truth** that Glenn extracts structured updates from —
the same review-before-apply loop, with a file as the origin. Every file that
produces a change stays attached as that change's receipt.

**What it is NOT.** Not Dropbox/Drive. Not generic file sharing, folders,
versioning, or per-user permission trees. Not a destination where files sit
inert. Not a place to store things Glenn never reads. If a file isn't a
potential source of plan facts, it doesn't need to be here.

**First file types (MVP).** PDF and images (PNG/JPG). Everything else (DOCX,
XLSX, HEIC, etc.) is later.

**What happens on PDF upload.**
1. Store the file (event-scoped), create a `files` row.
2. Extract text from the PDF.
3. Create a `messages` row from that text (channel = `document`/`file`), linked
   to the file.
4. Run the **existing** `extract-updates` pipeline on it → `ai_run` +
   `proposed_updates`.
5. The user gets a normal **review batch** in Ask Glenn — apply / clarify /
   dismiss, exactly as with typed input.
6. Applied changes carry provenance back to the file: the receipt is *"from
   itinerary.pdf, uploaded Jun 14."*

**What happens on image upload.**
- Attempt OCR / vision extraction (date, time, vendor, cost, details).
- If confident → same path as PDF (message → extraction → review batch).
- If low confidence → **attach as a source-only record** ("floorplan.png — kept
  as reference"), no proposals. Extraction can be retried later. A floorplan is
  the canonical "attach now, extract maybe never" case.

**How files become source/provenance records.** Reuse what exists: the `files`
table holds the blob/metadata; the generated `messages` row links to it via the
existing message→file relationship; `ai_run_id` / `source_message_id` thread the
proposals; the **provenance drawer leads with the file** ("From itinerary.pdf")
the same way it will lead with a voice note. No new provenance model — a file is
just the origin of a message.

**How it reuses the existing loop.** Entirely. The only genuinely new code is
*ingestion* (store + extract text/vision → produce a message). After that point,
nothing downstream knows or cares that the message came from a PDF. This is why
documents are an **adapter**, not a pipeline.

**MVP vs later.**
- **MVP:** upload PDF/image → store + link; PDF text extraction → message →
  existing extraction → review → Plan; file persists as source; provenance
  leads with the file.
- **Later:** image vision extraction quality, file previews/thumbnails, library
  organization (by vendor / by kind), typed parsers (contract/menu/itinerary),
  re-extract-on-demand, multi-file batch upload.

---

## 5. Document Upload Roadmap (staged)

| Stage | Capability | Reuses | Risk |
|---|---|---|---|
| 1 | Upload files, store in Event Library, link to event | `files` table, storage | Low |
| 2 | Extract text from PDF/image → create a `messages` source row | new ingestion only | Low–med (OCR quality) |
| 3 | Run **existing** extraction on that text → review batch | entire current pipeline | Low (proven) |
| 4 | Provenance drawer links back to file/source | existing provenance + `files` link | Low |
| 5 | Visual previews, thumbnails, library organization | UI only | Low |
| 6 | Typed contract/menu/itinerary parsing | new prompts/schemas per doc-type | **High** — fragile, new failure modes |

**Recommended MVP: Stages 1–4.** This delivers the entire user-visible promise
("upload a PDF, get reviewed plan changes with a receipt back to the file")
while reusing the proven loop and adding **only ingestion**. No new trust model,
no new review dimension, no per-doc-type parsers.

**Explicitly defer Stage 6.** Typed parsers are where document intelligence gets
brittle and broad. Only build them if pilots show generic extraction on document
text genuinely underperforms — and even then, per doc-type, behind the same
regression harness (`npm run test:extract`) discipline.

**Safety notes for whoever builds it:**
- Document text is *third-party material* (`FUTURE_STATE` §5 trust boundary):
  the uploading member is the attributed actor; the document is metadata. No
  elevated trust, no relaxed review.
- Large/garbled PDFs must fail like any extraction failure — a distinct
  retryable message, the saved message cleaned up so retry doesn't duplicate
  (the `extract:` error pattern already exists).

---

## 6. Visual Run of Show Concept

**How it differs from the current Timeline tab.** Same records, different mode.
`timeline_items` already carry a `type` that distinguishes **planning deadlines**
(milestones leading up to the event) from **day-of schedule** (the run of show).
The Timeline tab today is the *planning* projection — a list of dates. Run of
Show is the *day-of* projection — a calendar-like lane view of the event day.

**What records power it.** `timeline_items` (day-of type), linked to `vendors`
via `vendor_id` (the m20 anchor) so each block knows its partner; budget/task
links optional for rollups.

**How overlapping bars work.** A vertical (mobile) or horizontal (desktop)
time axis with **lanes/blocks** that can overlap:
- vendor setup windows (florist load-in 1–3pm)
- guest-facing moments (doors 6pm, dinner 7pm)
- internal prep (AV check 4–5pm)
- delivery/setup windows
- teardown
Overlap is the point — the view surfaces **conflicts** (two vendors needing the
same dock at once) and **gaps** (nothing scheduled between setup and doors).

**Example blocks.** "City Blooms delivery 3:00–3:30," "AV load-in 2:00–4:00,"
"Guest arrival 6:00," "Plated dinner 7:00–8:30," "Teardown 10:00–11:00."

**MVP.** Read-only day-of schedule rendered from existing `timeline_items` on a
vertical, scrollable, mobile-friendly timeline; visually flag obvious
overlaps/gaps. No editing — capture/edit still happens through the loop.

**Later.** Drag-to-reschedule, conflict-resolution UI, lanes grouped by vendor/
package, exportable run sheet, "Glenn flags a conflict as a risk" tie-in.

**How it supports mobile-first use.** Day-of, the planner is on their feet with
a phone — a vertical scrollable run-of-show is exactly the field artifact they
need ("what's next, who's where"). It is the strongest *phone-native* visual the
product has, far more useful than charts.

---

## 7. Today / Command Center Concept

The merged landing (Model C "Today"). Answers, on open: *what's the state of my
event and what needs me right now.*

**Candidate contents:** countdown to event · open items · pending-review count ·
vendor confirmations pending · budget readiness · run-of-show readiness · recent
changes ("since you last looked") · next best actions.

**MVP (build first):**
- **Countdown** — "X days until event." Character *and* utility for a pro.
- **Pending-review count** — "2 changes to review" → deep-links to the batch.
- **Needs-attention list** — open questions / blocking items, each deep-linked.
- **Recent changes** — "since you last looked," deep-linked to records.

These reuse data that already exists (proposed_updates counts, open_questions,
activity) and the highlight-routing that's already built.

**Later:**
- **Readiness indicators** — budget readiness (vs target), run-of-show
  completeness, vendor-confirmation tracker. These need light scoring logic and
  a confirmation concept; valuable but not day-one.
- **Next best actions** — ranked suggestions. Powerful, but ranking is a project;
  ship the raw lists first.

Framing rule (from `FUTURE_STATE` §4 Command Center): **deltas, not dashboards.**
Today directs attention; it never duplicates Plan's tables or grows charts.

---

## 8. Revised Roadmap — Next 8 (ordered, opinionated)

Reconciles drift: m17 (review-state reconciliation) and m18 (coordinated package
recall) are **done**. Numbering resumes at m19. Owner = who should drive it.

### 1. `m19-deployment-readiness` — *do this next*
- **Goal:** Netlify + hosted Supabase, all migrations applied, fresh seed, Sentry
  verified, the demo arc smoke-tested on the deployed URL.
- **Why now:** Phone-first, documents, every channel, invite, and any pilot are
  *all* blocked on a real URL. The loop is reliable enough to ship today.
- **Scope:** follow `docs/DEPLOYMENT.md`; env wiring; migration run; seed; smoke
  test; no feature code.
- **Acceptance:** the 5-minute demo arc completes on the hosted URL; auth works;
  extraction works against hosted Supabase; Sentry receives an event.
- **Risk:** env/secret + RLS-on-hosted surprises. Low feature risk.
- **Owner:** Codex-capable / human-paired (DEPLOYMENT.md is the spec).

### 2. `m20-entity-linking-vendor-anchor`
- **Goal:** populate `budget_items.vendor_id` (and extend the nullable-FK pattern
  to tasks/timeline/questions where extraction is confident) at approve time.
- **Why now:** the vendor *is* the planning component for ~80% of cases; this is
  the foundation Run of Show, partner rollups, and robust cascades all lean on.
  Replaces fragile text-matching from m15/m18.
- **Scope:** approve-time linking; backfill for seed; no new entity, no UI rename.
- **Acceptance:** approving a vendor-attributed budget/timeline row writes a real
  FK; provenance/Plan can show the link; cascades use FKs where present.
- **Risk:** mis-attribution at extraction → wrong link. Guard with confidence +
  review; FK stays nullable.
- **Owner:** Claude/Opus (data-model care).

### 3. `m21-mobile-first-responsive-polish`
- **Goal:** capture + review + Plan read genuinely well on a phone.
- **Why now:** documents make mobile primary; the field user is the premise. Must
  land before the Library, or we ship document capture into a desktop-only shell.
- **Scope:** responsive pass on Ask Glenn (capture + review batches), Plan tabs,
  Command Center/Today; touch targets; no IA rename yet (responsive *current* IA).
- **Acceptance:** the demo arc is comfortable on a 390px viewport; review batch
  decidable one-thumbed.
- **Risk:** scope creep into redesign. Guard: responsive only, no relabel.
- **Owner:** Claude/Opus.

### 4. `m22-event-library-file-upload`
- **Goal:** Stage 1 — upload PDF/image, store event-scoped, link as a source.
- **Why now:** first concrete step of the headline new direction; small, safe,
  unblocks Stage 2.
- **Scope:** upload UI, `files` storage, Event Library surface (list + source
  link). No extraction yet.
- **Acceptance:** a planner uploads a PDF/image; it persists, is event-scoped,
  and appears in the Library linked to the event.
- **Risk:** storage/RLS config. Low.
- **Owner:** Claude/Opus.

### 5. `m23-document-image-extraction`
- **Goal:** Stages 2–4 — PDF text (and confident image) → `messages` source →
  existing extraction → review batch → provenance leads with the file.
- **Why now:** delivers the full "upload a document, get reviewed plan changes
  with a receipt" promise on top of m22.
- **Scope:** ingestion (text/vision → message); reuse `extract-updates`
  unchanged; provenance file-lead; low-confidence images attach source-only.
- **Acceptance:** uploading an itinerary PDF yields a review batch of
  timeline/run-of-show proposals; applied rows trace back to the file.
- **Risk:** OCR/vision quality; garbled-PDF failures. Guard: extraction-failure
  pattern + regression scenarios.
- **Owner:** Claude/Opus.

### 6. `m24-today-command-center-refresh`
- **Goal:** the "Today" MVP — countdown, pending-review count, needs-attention,
  recent changes, all deep-linked.
- **Why now:** with deployment + mobile + documents in, the landing should reflect
  the phone-first model; well-specified, mostly reuses existing data.
- **Scope:** merge Dashboard/Command Center landing into Today (MVP contents
  only); readiness scoring deferred.
- **Acceptance:** opening an event shows countdown + review count + attention list
  + recent changes; every item deep-links.
- **Risk:** drifting into dashboards/charts. Guard: deltas-not-dashboards.
- **Owner:** Codex (well-specified) or Claude/Opus.

### 7. `m25-visual-run-of-show`
- **Goal:** read-only day-of run-of-show lane view from existing `timeline_items`
  (+ m20 vendor links), with overlap/gap flagging, mobile-vertical.
- **Why now:** the strongest phone-native visual; rides on m20 links and the
  day-of `type` that already exists.
- **Scope:** read-only render; conflict/gap highlight; no drag/edit.
- **Acceptance:** day-of items render as time-ordered overlapping blocks; an
  obvious conflict/gap is visibly flagged.
- **Risk:** scope creep into a scheduler. Guard: read-only MVP.
- **Owner:** Claude/Opus.

### 8. `m26-guided-create-to-intake`
- **Goal:** replace the static create form with a short guided intake (event
  kind, size, date, what to track — selectable cards) landing in Ask Glenn.
- **Why now:** the funnel into the loop; welcome + checklist already exist; salvage
  from `fable-production-mvp-run`. Sequenced last so it lands users into a
  product that already feels phone-first with a Library.
- **Scope:** guided intake UI → seeds initial context → drops into Ask Glenn.
  Not gimmicky; no new record types.
- **Acceptance:** a new event is created via guided steps and lands in Ask Glenn
  with context primed.
- **Risk:** gimmick drift. Guard: 4 questions max, real defaults.
- **Owner:** Claude/Opus.

*Deferred beyond the 8:* `client-request-intake-mode` (feasibility assessment —
a new mode, post-library); `applied-timeline-corrections` if any hole remains
after m20; team invite + voice/email channels (sequenced after the URL exists,
per `FUTURE_STATE` §5–6). Swap m19↔ later items only if a fixed pilot date
forces it.

---

## 9. Immediate Recommendation for Tomorrow

**Work on deployment readiness — `m19-deployment-readiness`.**

Why, over the alternatives:
- **Entity linking** is the right #2 and the foundation for Run of Show and
  rollups — but it improves a loop that still only runs on `localhost`.
- **Event Library MVP** is the exciting headline — but shipping document capture
  into a desktop-only, unhosted app strands it; it needs both a URL (to be used
  in the field) and the mobile pass.
- **Review story cards** are already substantially delivered by m18's coordinated
  packages; diminishing returns.
- **Guided create-to-intake** is best *last*, landing users into a product that
  already feels phone-first with a Library.

Deployment is the **lowest-risk, highest-unblock** move: the loop is proven,
`docs/DEPLOYMENT.md` is a ready spec, and a hosted URL is the literal
precondition for phone-first use, document capture in the field, pilots, invite,
and every future channel. Ship the URL; then m20 entity linking; then the
phone-first + Library arc.

---

## 10. Doc Reconciliation Note

This direction is summarized concisely in:
- `PRODUCT_CHECKPOINT.md` — current-state + reconciled roadmap order.
- `FUTURE_STATE_PRODUCT_PLAN.md` — "M19 direction update" (phone-first headline,
  simpler IA, Event Library as a capture channel extending §5, Run of Show
  visual, revised roadmap pointer, tomorrow recommendation).

Principles unchanged (`FUTURE_STATE` §7): Glenn never silently changes the plan;
the Plan is current truth; every fact has a receipt; records are atomic,
experiences group; **channels — now including documents and images — are
adapters into one loop**; review is a habit; ship only what strengthens the loop.
