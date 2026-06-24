# Glenn Events — Test Suite (lifecycle sessions, audited via Supabase)

> **Method.** Owner drives the real app (real Glenn, real LLM) **as a planner actually would** —
> many notes over a "session," approving some suggestions, parking others, answering Glenn's
> questions — and Claude audits each event by its **`event_id`** through Supabase, diffing the
> real records against the **per-note checkpoints** below.
>
> Two **flagship lifecycles** (Corporate Dinner, Wedding) run long and stateful — vendors and
> prices accrue, quotes get corrected, the date/headcount/budget shift, tentative items get
> booked. Three **lighter events** (Nonprofit, Conference, Casual) cover the rest in 2–3 notes.
>
> **Why stateful matters:** each approval changes what Glenn sees as *Current Event State* and
> *Queued for review*, so interleaving approvals is the only way to test corrections-in-place,
> supersession, and no-duplicates across turns. Send the notes **in order**, do the **Then:**
> action after each, then move on.

**Checkpoint key:**
✅ new record(s) Glenn should add · 🔄 update an existing record **in place** (one row, no dup) ·
🎫 an **Event details** card (date/guests/budget/location) — approve **on its own**, never in bulk ·
🚫 must NOT happen · 💬 expect a natural, conversational reply that **names the change** (never the
canned "I saved your note. Review the suggestions…" line).

## Run + audit loop
1. **Reset** (optional clean slate): Supabase SQL Editor — `delete from events;` (cascades to all
   child records; irreversible). Keep the demo with `where id <> 'c9633e80-…'`.
2. **Create** the event. Only **name + type** are required — leave **date / guests / budget**
   blank on the flagships (we set them *through Glenn* mid-session, on purpose). Event 4 needs a
   real date for the timezone check.
3. Work the notes **in order**: paste a note → read Glenn's reply → do the **Then:** action
   (approve which tile, answer which question, leave which pending) → next note.
4. Tell Claude the **`event_id`** (+ which note you're through). Claude runs the **verify** query
   and reports **PASS/FAIL against each checkpoint**, naming any drift.

**List events (grab ids):**
```sql
select e.id, e.name, to_char(e.created_at,'MM-DD HH24:MI') as created,
  (select count(*) from vendors v where v.event_id=e.id) as vendors,
  (select count(*) from timeline_items t where t.event_id=e.id) as timeline
from events e order by e.created_at desc;
```
**Verify one event (paste its id):** returns the event row (high-level facts) + every record.
```sql
with ev as (select id from events where id = 'PASTE-EVENT-ID')
select
  (select json_build_object('date',event_date,'guests',attendee_target,'budget',budget_target,'location',location) from events where id=(select id from ev)) as event_facts,
  (select json_agg(json_build_object('type',update_type,'status',status,'group',group_label,'op',operation,'payload',payload_json) order by created_at) from proposed_updates where event_id=(select id from ev)) as proposed_updates,
  (select json_agg(json_build_object('name',name,'status',status,'cost',estimated_cost,'archived',archived_at is not null) order by created_at) from vendors where event_id=(select id from ev)) as vendors,
  (select json_agg(json_build_object('cat',category,'desc',description,'cost',estimated_cost,'status',status,'archived',archived_at is not null) order by created_at) from budget_items where event_id=(select id from ev)) as budget,
  (select json_agg(json_build_object('title',title,'starts',starts_at,'ends',ends_at,'type',type,'archived',archived_at is not null) order by starts_at) from timeline_items where event_id=(select id from ev)) as timeline,
  (select json_agg(json_build_object('title',title,'status',status,'priority',priority,'due',due_date) order by created_at) from tasks where event_id=(select id from ev)) as tasks,
  (select json_agg(json_build_object('title',title,'severity',severity,'status',status) order by created_at) from risks where event_id=(select id from ev)) as risks,
  (select json_agg(json_build_object('title',title,'status',status,'decision',decision) order by created_at) from decisions where event_id=(select id from ev)) as decisions,
  (select json_agg(json_build_object('q',question,'status',status) order by created_at) from open_questions where event_id=(select id from ev)) as open_questions;
```

---

# Flagship 1 — Corporate dinner · "Northwind Capital — Partner Dinner"
*A planner runs a 3-month lead-up: messy kickoff, a forwarded quote, a price correction, a*
*vendor that flakes, a tentative add that later books, two budget/headcount changes.*
**Create as:** corporate dinner · **no date, no guests** · budget target **$12,000**.

**1 · Kickoff brain-dump (the site visit).**
> "just wrapped the site visit at The Gilded Fork. private room fits 45, we're planning around 40.
> they need final headcount 2 weeks out. catering's a prix fixe $95/head incl dessert, but bar is
> separate — figure ~$1,800 for a 3-hour open bar. they want a 50% deposit ($3,000) by the 20th to
> hold the date. valet's a $350 flat fee. we need AV for a short partner toast (mic + small
> speaker) — call ProSound. and the GM mentioned street closures that weekend that could slow guest
> arrival."
> **Then:** approve the **Gilded Fork** tile (venue + catering + open bar + valet + deposit) and the
> AV/headcount/risk items. Leave any "what's the date?" question pending.
> **Checkpoint:** ✅ vendor *Gilded Fork* (venue); budget catering **$3,800** ($95×40), open bar
> **$1,800**, valet **$350**, deposit **$3,000**; deadlines "final headcount — 2 wks out" and
> "deposit by the 20th"; task/prospect *ProSound* (AV); risk street closures. 🚫 no invented event
> date (expect a pending question instead). 💬 reply flags the deposit deadline.

**2 · Lock the date + headcount (high-level facts).**
> "ok the date's locked — October 15, 2026. and put us down for 44 guests, the partners added a few."
> **Then:** approve the **Event details** card on its own.
> **Checkpoint:** 🎫 ONE Event details card — *Event date: Not set → Oct 15, 2026 · Guest count:
> Not set → 44* (approve solo). 🔄 the "what's the date?" question can resolve. 🚫 the date must NOT
> become a timeline deadline; the headcount must NOT become a budget line. 💬 reply. *(Note: the
> catering line still reads $95×40 — it does **not** auto-recompute. We fix that in note 4.)*

**3 · Forwarded photographer email (package → atomic split).**
> "fwd from photographer: 'Confirming Vance Studio — 3 hours coverage, edited gallery in 2 weeks,
> $1,650. We arrive 30 min early to set up. 50% to book, balance on delivery.'"
> **Then:** approve the **Vance Studio** tile.
> **Checkpoint:** ✅ under one *Vance Studio* tile — vendor (Photography, confirmed) + budget
> photography **$1,650** + timeline "arrive 30 min early — setup" + task/budget 50% retainer
> **$825**. 🚫 no invented times beyond "30 min early". 💬 reply.

**4 · Catering correction (price change + recompute).**
> "catering came in higher than the site visit — it's $110/head now, we added a cheese course.
> recompute for our 44."
> **Then:** approve the catering update.
> **Checkpoint:** 🔄 the **existing** catering budget line updates **in place** to **$4,840**
> ($110×44), `op:update`, **one row**. 🚫 must NOT add a second catering line. 💬 reply names the
> new catering total.

**5 · A bar-cost detail (new line, may answer a pending question).**
> "on the bar — the $1,800 covers the bartenders but NOT gratuity. add a 20% gratuity line on the
> bar."
> **Then:** approve.
> **Checkpoint:** ✅ budget "Bar gratuity" **$360** (20%×$1,800). 🔄 if Glenn had a pending bar
> question, it resolves. 🚫 must NOT duplicate or alter the $1,800 bar line. 💬 reply.

**6 · A vendor flakes → replacement.**
> "ProSound never called back — we're going with ClearAudio instead. they quoted $600 all-in for
> the mic + speaker for the toast."
> **Then:** approve.
> **Checkpoint:** 🔄 ProSound removed/closed (archive the vendor or mark its task done as obsolete);
> ✅ vendor *ClearAudio* (AV, confirmed) + budget AV **$600**. 🚫 ProSound must NOT remain an active
> AV vendor alongside ClearAudio. 💬 reply.

**7 · A tentative add — restraint.**
> "thinking about a string trio for the cocktail hour, maybe around $800, but I haven't booked
> anything — still comparing two groups."
> **Then:** leave it pending (do **not** approve a vendor).
> **Checkpoint:** ✅ a **pending decision** "String trio — comparing two groups (~$800)". 🚫 must
> NOT create a confirmed vendor or a budget line (explicitly tentative/comparing). 💬 reply.

**8 · Budget bump (high-level fact).**
> "good news — finance approved a bump, our budget's now $14,000."
> **Then:** approve the Event details card solo.
> **Checkpoint:** 🎫 ONE Event details card — *Budget target: $12,000 → $14,000* (approve solo).
> 🚫 must NOT become a budget line item. 💬 reply.

**9 · Tentative → confirmed (promote the trio).**
> "booked the string trio — it's Velvet Strings, $850 confirmed, they play 6:30 to 8:00."
> **Then:** approve the **Velvet Strings** tile.
> **Checkpoint:** ✅ vendor *Velvet Strings* (Music, confirmed) + budget **$850** + timeline
> **6:30–8:00 PM**. 🔄 the note-7 "string trio" decision resolves to *decided* (Glenn re-proposes it
> merged — no orphan pending decision). 🚫 no duplicate trio decision left dangling. 💬 reply.

**10 · Week-of finalization (final headcount + deposit paid).**
> "final headcount to the venue is 42 — two partners dropped. and the deposit cleared, mark it paid."
> **Then:** approve the Event details card solo; approve the deposit status change.
> **Checkpoint:** 🎫 Event details — *Guest count: 44 → 42* (approve solo); 🔄 deposit budget line
> status → **paid** (`op:update`, no dup); ✅ optional task "send venue final count of 42". 🚫
> catering does NOT silently recompute to 42 (you didn't ask — a follow-up note would). 💬 reply.

**End state (audit):** Gilded Fork (venue); ClearAudio + Velvet Strings + Vance Studio vendors
(ProSound archived/closed); budget = catering $4,840, open bar $1,800, gratuity $360, valet $350,
deposit $3,000 (paid), photography $1,650 (+retainer $825), AV $600, trio $850; event row **date
Oct 15 2026, 42 guests, $14,000 budget**; one pending→decided trio decision; risk street closures.

---

# Flagship 2 — Wedding · "Ava & Sam — Garden Wedding"
*Voice-to-text kickoff, then the slow real-world drip: a price drop, a cake finally chosen, the DJ*
*booked, a shuttle that falls through, RSVPs landing, the catering math moving with the headcount.*
**Create as:** wedding · **no date, no guests** · budget target **$30,000**.

**1 · Voice-to-text kickoff.**
> "ok for ava and sam — we locked gold and white. florist is Petal & Stem, they quoted 2400 for
> ceremony + reception arrangements. still deciding on cake — Sweet Layers can do it for like 1100
> but we're waiting on another baker. leaning DJ over a band. ceremony's at 4 and the first toast is
> 7 sharp because grandma leaves by 730. oh and we need a shuttle for guests from the hotel."
> **Then:** approve the **Petal & Stem** tile + ceremony/toast timeline + grandma risk + shuttle
> task. **Leave pending:** the Cake decision, the DJ decision, the florist-delivery question.
> **Checkpoint:** ✅ decision colors gold/white (*decided*); Petal & Stem vendor + budget **$2,400**;
> timeline ceremony **4:00 PM** + first toast **7:00 PM**; risk grandma **7:30** hard stop; task
> shuttle. ✅ **pending** decision "Cake — Sweet Layers ~$1,100 vs another baker" and **pending**
> decision "DJ vs band (leaning DJ)". 🚫 **NO Sweet Layers vendor, NO $1,100 cake budget** (tentative);
> no DJ vendor; no fabricated date. 💬 reply with the grandma-7:30 heads-up.

**2 · Lock date + headcount (high-level facts).**
> "date's locked — Saturday, August 22, 2026. planning for 90 guests."
> **Then:** approve the Event details card solo.
> **Checkpoint:** 🎫 ONE card — *Event date: Not set → Aug 22, 2026 · Guest count: Not set → 90*
> (approve solo). 🚫 not a deadline / not a budget line. 💬 reply. *After approve:* the Day-of grid +
> countdown anchor to Aug 22 and the 4:00/7:00 times sit on that day in the event's local zone.

**3 · Florist correction-in-place.**
> "Petal & Stem came down to 2000, and they'll throw in the arch install too."
> **Then:** approve the update.
> **Checkpoint:** 🔄 Petal & Stem budget updates **in place** to **$2,000** (`op:update`), **one
> row**; desc/notes mention the arch install. 🚫 no second florist vendor or budget line. 💬 reply
> ("$400 back, plus the arch").

**4 · Cake resolved → promote tentative to confirmed.**
> "cake's decided — going with Sweet Layers after all. $1,150 final, and they'll deliver by 2pm."
> **Then:** approve the **Cake** tile.
> **Checkpoint:** 🔄 the pending "Cake" decision → *decided* (Sweet Layers); ✅ **now** vendor *Sweet
> Layers* (Bakery, confirmed) + budget cake **$1,150** + timeline "cake delivery — 2:00 PM" (single
> time → `starts_at` 2 PM, no end). 🚫 the cake decision must NOT stay pending or duplicate. 💬 reply.

**5 · DJ booked.**
> "locked the DJ — Spinmaster Entertainment, $1,400, they'll run 8pm to 11pm."
> **Then:** approve the **Spinmaster** tile.
> **Checkpoint:** 🔄 "DJ vs band" decision → *decided* (DJ); ✅ vendor *Spinmaster* (Entertainment,
> confirmed) + budget **$1,400** + timeline **8:00–11:00 PM**. 🚫 no band vendor; no duplicate DJ
> decision. 💬 reply.

**6 · Answer Glenn's shuttle question (intake → answer).**
> "on the shuttle — guests are at the Riverside Marriott, and we need it round-trip. figure about 30
> people."
> **Then:** answer/resolve the pending shuttle question.
> **Checkpoint:** 🔄 the shuttle question resolves (*answered*) with hotel + round-trip + ~30; ✅
> optional task update "source round-trip shuttle from Riverside Marriott (~30 guests)". 🚫 no
> fabricated shuttle price (none stated). 💬 reply.

**7 · A would-be vendor falls through (graceful no-op archive).**
> "the shuttle company I was about to book just told me they're full that weekend — back to square
> one on transport."
> **Then:** approve whatever Glenn proposes.
> **Checkpoint:** 🔄 shuttle task stays open / re-flagged (or a risk "transport unresolved"). 🚫 since
> **no shuttle vendor was ever confirmed**, Glenn must NOT archive a vendor that never existed, nor
> fabricate one just to cancel it. 💬 reply.

**8 · RSVPs land — headcount jump (high-level fact).**
> "RSVPs closed — we're at 104, not 90."
> **Then:** approve the Event details card solo.
> **Checkpoint:** 🎫 Event details — *Guest count: 90 → 104* (approve solo). 🚫 not a budget line.
> 💬 reply.

**9 · Catering enters (headcount-aware math + deadline).**
> "caterer's booked — Garden Table Catering, $85 a head plus a flat $500 service fee. they need the
> final count two weeks before the date."
> **Then:** approve the **Garden Table** tile.
> **Checkpoint:** ✅ vendor *Garden Table* (Catering, confirmed) + budget catering **$8,840**
> ($85×**104**) + budget "service fee" **$500** + deadline "final catering count — 2 wks before Aug
> 22" (≈ **Aug 8**). 🚫 must use the current 104, not the old 90; no invented extras. 💬 reply.

**10 · Budget raise (high-level fact).**
> "we bumped the overall budget to 34k to cover the bigger guest count."
> **Then:** approve the Event details card solo.
> **Checkpoint:** 🎫 Event details — *Budget target: $30,000 → $34,000* (approve solo). 🚫 not a
> budget line item. 💬 reply.

**11 · Week-of finalization (count correction + constraint-linked task).**
> "final count to Garden Table is 100 — a few dropped. and remember grandma leaves at 7:30, so the
> photographer has to get all the family photos done before then."
> **Then:** approve.
> **Checkpoint:** 🔄 catering budget recomputes **in place** to **$8,500** ($85×100) on the Garden
> Table line (`op:update`, no dup); ✅ task/timeline "family photos done before 7:00 toast / 7:30
> grandma departure". 🚫 no duplicate catering line; the grandma risk is **not** re-created. 💬 reply.

**End state (audit):** vendors Petal & Stem ($2,000), Sweet Layers ($1,150), Spinmaster ($1,400),
Garden Table ($8,500 + $500 fee) — all confirmed; two decisions *decided* (colors, cake, DJ);
shuttle unresolved (task/risk, no phantom vendor); event row **date Aug 22 2026, 100 guests** (104
during RSVP phase) **, $34,000 budget**; risk grandma 7:30 (single row); times render in local zone.

---

# Lighter events (2–3 notes each)

## 3 — Nonprofit fundraiser · "Hope Lodge — Benefit Auction"
*Email parse + a data-model edge (sponsor income), then a cancellation + a sponsorship change.*
**Create as:** benefit auction · ~120 guests · budget target $15,000.

**1 ·**
> "fwd: 'Crave Catering for the auction — passed apps + plated dinner for 120 at $68/head = $8,160.
> Bar package +$2,400. We need final count 10 days out and a 25% deposit to confirm.' — also we
> locked Acme Corp as presenting sponsor for $5,000; I need to send their logo to the printer by
> Thursday. and the auctioneer, Jim Dale, wants his $500 fee upfront."
> **Then:** approve the catering/bar/deposit + the logo task + Jim Dale.
> **Checkpoint:** ✅ vendor Crave Catering; budget catering **$8,160** + bar **$2,400** + deposit 25%
> (**$2,040**); deadline final count (10 days out); task "send Acme logo to printer (Thu)"; Jim Dale
> ($500) as vendor + budget/task. 🚫 **Acme $5,000 is income** — track as a task/open-question, **not**
> a negative budget or a vendor. 💬 reply.

**2 · Cancellation + sponsorship change.**
> "auctioneer Jim Dale had to cancel — his fee's off the table. and Acme bumped their sponsorship to
> $7,500."
> **Then:** approve.
> **Checkpoint:** 🔄 Jim Dale vendor archived + his $500 line removed (`op:archive`, no stale spend);
> 🔄 the Acme sponsorship tracking task/question updates to **$7,500** — still **not** a budget line.
> 🚫 no leftover Jim Dale spend; income still not modeled as budget. 💬 reply.

## 4 — Conference / workshop · "DevSummit — Engineering Offsite"
*Dense schedule + timezone correctness, then a whole-agenda time shift (corrections in place).*
**Create as:** workshop · ~60 attendees · budget target $8,000 · **set a real date ~6 weeks out**
(needed for the day-of grid + timezone check).

**1 ·**
> "agenda for the offsite: 9:00 registration + coffee, 9:30 keynote, 10:45 breakouts in 3 rooms,
> 12:00 lunch, 1:30 hands-on workshops, 3:00 break, 3:15 panel, 4:30 closing remarks. we need AV +
> screens in all 3 breakout rooms — call MediaWorks. the keynote speaker has a hard stop at 10:30 to
> catch a flight. catering's $45/head for lunch + breaks."
> **Then:** approve the schedule + MediaWorks + risk + catering.
> **Checkpoint:** ✅ ~**8 timeline items** at the stated times, rendered in the event's **local zone**
> (9:00 AM … 4:30 PM — **not** UTC-shifted); task/vendor MediaWorks (AV, 3 rooms); risk keynote hard
> stop **10:30**; budget catering **$2,700** ($45×60). 💬 reply. **Open the Day-of grid — times must
> match.**

**2 · Shift the whole morning (multi-item correction).**
> "everything slips 30 minutes — registration now 9:30, keynote 10:00, and the speaker's hard stop
> moves to 11:00."
> **Then:** approve the updates.
> **Checkpoint:** 🔄 the registration + keynote timeline items update **in place** to the new times
> (`op:update`, no duplicate rows); 🔄 the hard-stop risk updates to **11:00**. 🚫 no second copy of
> the morning agenda; later items only move if you say so. 💬 reply.

## 5 — Casual social · "Leo's 30th — Birthday Dinner"
*Tentative language → restraint, a resolution, then the venue actually books (tentative→confirmed).*
**Create as:** birthday · ~20 guests · (budget optional).

**1 ·**
> "planning leo's 30th! thinking ~20 people, want a nice dinner out. maybe Lola's or that new spot
> Marrow downtown, haven't decided. might do a slideshow of old photos. still need to sort a cake."
> **Then:** approve only what's concrete.
> **Checkpoint:** 🚫 **NO** confirmed venue vendor (Lola's/Marrow tentative → a **pending decision**
> "venue: Lola's vs Marrow"); slideshow + cake → tasks/open-questions; **no** fabricated budget. 💬 reply.

**2 · Resolve the venue.**
> "Lola's is booked solid that night, so we're going with Marrow."
> **Then:** approve.
> **Checkpoint:** 🔄 venue decision → *decided* (Marrow). 🚫 Lola's never becomes a confirmed/archived
> vendor (it never was one). 💬 reply.

**3 · The venue actually books (tentative → confirmed).**
> "Marrow needs a card on file — $500 deposit to hold the private room for 20."
> **Then:** approve the Marrow tile.
> **Checkpoint:** ✅ **now** vendor *Marrow* (venue, confirmed) + budget deposit **$500** (it's booked
> now, not tentative). 🚫 no duplicate venue decision left pending. 💬 reply.

---

## Pass bar
Zero fabricated facts · zero duplicates · corrections update **in place** · cancellations archive
(no stale committed spend) · packages split into atomic vendor+budget+timeline · tentative language
never becomes a confirmed record (until a later note books it) · high-level facts (date/guests/
budget) change **only** via an approved Event-details card, never as plan items · headcount-aware
budgets use the **current** count · times render in the event's local zone · Glenn replies stay
conversational and name the change. Bugs found → logged here / fixed iteratively.
(Optional later: `scripts/verify-scenario.ts` for unattended re-runs.)
