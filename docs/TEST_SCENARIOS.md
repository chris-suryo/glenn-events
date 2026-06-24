# Glenn Events — Test Suite (5 varied events, audited via Supabase)

> **Method.** Owner drives the real app (real Glenn, real LLM); Claude audits each event by its
> **`event_id`** through Supabase (SQL Editor or MCP) and diffs the actual records against the
> **Expected** ground truth below — semantically. Five deliberately different events cover the
> system end-to-end; bugs found get logged and fixed iteratively.
>
> Each event lists **Setup**, the verbatim **Input(s)** to paste into Ask Glenn, **Expected**
> (must-have / update-not-duplicate / must-NOT-fabricate), and the **Audit focus**.

## Run + audit loop
1. **Reset** (optional, clean slate): in the Supabase SQL Editor — `delete from events;`
   (cascades to all child records; irreversible). Or keep the demo: add `where id <> 'c9633e80-…'`.
2. For each event below: **create it** in the app. Only **name** and **type** are required —
   **date, guest count, and budget target are optional** at creation (the wizard saves only what
   you fill in), so skip them freely. Paste **Input A**, review + **approve**; then any later
   inputs (B/C). Screenshot the Run of Show for time checks.
   - **If you skip the date:** Glenn does *not* fabricate one — it raises an open-question
     ("what's the actual date?") and uses a placeholder (e.g. June 10) only to position day-of
     times; the Lead-up calendar and Day-of grid stay empty until a real date exists. **Event 4
     (timezone test) needs a real date** ~6 weeks out — set it there.
   - **Appending high-level facts (now supported via Glenn):** you *can* slot in or change the
     event's date, guest count, budget, or location after creation by telling Glenn in Ask Glenn
     ("the wedding is June 20, we're up to 110 guests, budget's now $35k"). Glenn proposes an
     **Event details** card that you approve **individually** in Review (it's marked high-stakes,
     indigo, never swept into "Apply safe"). On approve it patches the event row. See the
     **"Appending high-level facts"** test below.
3. Tell Claude **the `event_id` + event number** (get ids via the list query). Claude runs the
   **verify-by-id** query and reports **PASS/FAIL per expectation**, naming any mismatch.

**List events (to grab ids):**
```sql
select e.id, e.name, to_char(e.created_at,'MM-DD HH24:MI') as created,
  (select count(*) from vendors v where v.event_id=e.id) as vendors,
  (select count(*) from timeline_items t where t.event_id=e.id) as timeline
from events e order by e.created_at desc;
```
**Verify one event (paste its id):**
```sql
with ev as (select id from events where id = 'PASTE-EVENT-ID')
select
  (select json_agg(json_build_object('type',update_type,'status',status,'payload',payload_json) order by created_at) from proposed_updates where event_id=(select id from ev)) as proposed_updates,
  (select json_agg(json_build_object('name',name,'status',status,'cost',estimated_cost,'archived',archived_at is not null) order by created_at) from vendors where event_id=(select id from ev)) as vendors,
  (select json_agg(json_build_object('cat',category,'desc',description,'cost',estimated_cost,'status',status,'archived',archived_at is not null) order by created_at) from budget_items where event_id=(select id from ev)) as budget,
  (select json_agg(json_build_object('title',title,'starts',starts_at,'ends',ends_at,'type',type) order by starts_at) from timeline_items where event_id=(select id from ev)) as timeline,
  (select json_agg(json_build_object('title',title,'status',status,'priority',priority,'due',due_date) order by created_at) from tasks where event_id=(select id from ev)) as tasks,
  (select json_agg(json_build_object('title',title,'severity',severity,'status',status) order by created_at) from risks where event_id=(select id from ev)) as risks,
  (select json_agg(json_build_object('title',title,'status',status) order by created_at) from decisions where event_id=(select id from ev)) as decisions,
  (select json_agg(json_build_object('q',question,'status',status) order by created_at) from open_questions where event_id=(select id from ev)) as open_questions;
```

---

## Event 1 — Corporate dinner · "Northwind Capital — Partner Dinner"
*Style: messy planner brain-dump + a forwarded vendor email. Tests breadth + package split.*
**Setup:** corporate dinner · ~40 guests · budget target $12,000.

**Input A (paste):**
> "just wrapped the site visit at The Gilded Fork. private room fits 45, we're at 40. they need
> final headcount 2 weeks out. catering's a prix fixe $95/head incl dessert, but bar is separate —
> figure ~$1,800 for a 3-hour open bar. they want a 50% deposit ($3,000) by the 20th to hold the
> date. valet's a $350 flat fee. we need AV for a short partner toast (mic + small speaker) — call
> ProSound. and the GM mentioned street closures that weekend that could slow guest arrival."

**Input B (paste — forwarded email):**
> "fwd from photographer: 'Confirming Vance Studio — 3 hours coverage, edited gallery in 2 weeks,
> $1,650. We arrive 30 min early to set up. 50% to book, balance on delivery.'"

**Expect:** venue *Gilded Fork*; **budget** catering **$3,800** ($95×40), open bar **$1,800**,
valet **$350**, deposit **$3,000** (+ a deadline "by the 20th"); **deadline** final headcount
(2 wks out); **task/vendor** ProSound (AV mic+speaker); **risk** street closures / guest arrival.
From B (package → 3 atomic): **vendor** Vance Studio, **budget** photography **$1,650**, **timeline**
arrive 30 min early (setup), + retainer task/budget $825. **No** invented prices.
**Audit:** recall breadth; package split; deadlines; forwarded-email parse.

## Event 2 — Wedding · "Ava & Sam — Garden Wedding"
*Style: voice-to-text run-on, then a correction. Tests decisions, tentative-restraint, correction-in-place, hard constraint.*
**Setup:** wedding · ~90 guests · budget target $30,000.

**Input A (paste):**
> "ok for ava and sam — we locked gold and white. florist is Petal & Stem, they quoted 2400 for
> ceremony + reception arrangements. still deciding on cake — Sweet Layers can do it for like 1100
> but we're waiting on another baker. leaning DJ over a band. ceremony's at 4 and the first toast is
> 7 sharp because grandma leaves by 730. oh and we need a shuttle for guests from the hotel."

**Input B (paste — later):**
> "update: Petal & Stem came down to 2000, and they'll throw in the arch install too."

**Expect (A):** **decision** colors gold/white (decided); **vendor** Petal & Stem (florals) +
**budget $2,400**; **open-question/decision** cake (Sweet Layers ~$1,100 vs pending — **NOT** a
confirmed vendor/budget yet); **decision/task** DJ-vs-band (leaning DJ — not a confirmed vendor);
**timeline** ceremony **4:00 PM**, toast **7:00 PM**; **risk/constraint** grandma departs **7:30**;
**task** guest shuttle.
**Expect (B):** Petal & Stem **budget updated to $2,000** — *one* row, **no duplicate** florist;
optional task/note re: arch install.
**Audit:** decision vs tentative classification; correction updates in place; times; hard constraint.

## Event 3 — Nonprofit fundraiser · "Hope Lodge — Benefit Auction"
*Style: forwarded catering quote + sponsor/logistics note. Tests email parse + a data-model edge (sponsor income).*
**Setup:** benefit auction · ~120 guests · budget target $15,000.

**Input A (paste):**
> "fwd: 'Crave Catering for the auction — passed apps + plated dinner for 120 at $68/head =
> $8,160. Bar package +$2,400. We need final count 10 days out and a 25% deposit to confirm.' —
> also we locked Acme Corp as presenting sponsor for $5,000; I need to send their logo to the
> printer by Thursday. and the auctioneer, Jim Dale, wants his $500 fee upfront."

**Expect:** **vendor** Crave Catering; **budget** catering **$8,160** + bar **$2,400** + deposit
25% (**$2,040**); **deadline** final count (10 days out); **task** send Acme logo to printer (by
Thursday); auctioneer Jim Dale ($500 fee) as **vendor + budget/task**. **Sponsor Acme $5,000 is
income** — the data model has no income concept, so the *right* behavior is a task/open-question
(track the sponsorship), **not** a fabricated negative budget or a vendor. **Audit:** does Glenn
handle the unrepresentable "income" gracefully without inventing structure?

## Event 4 — Conference / workshop · "DevSummit — Engineering Offsite"
*Style: a dense schedule dump. Tests timeline breadth + correct local times (the timezone fix) + a hard constraint.*
**Setup:** workshop · ~60 attendees · budget target $8,000.

**Input A (paste):**
> "agenda for the offsite: 9:00 registration + coffee, 9:30 keynote, 10:45 breakouts in 3 rooms,
> 12:00 lunch, 1:30 hands-on workshops, 3:00 break, 3:15 panel, 4:30 closing remarks. we need AV +
> screens in all 3 breakout rooms — call MediaWorks. the keynote speaker has a hard stop at 10:30
> to catch a flight. catering's $45/head for lunch + breaks."

**Expect:** ~**8 timeline items** at the stated times, rendered in the event's **local zone** (9:00
AM … 4:30 PM — **not** shifted to UTC); **task/vendor** MediaWorks (AV, 3 rooms); **risk/constraint**
keynote hard stop **10:30**; **budget** catering **$2,700** ($45×60) or a per-head line. **Audit:**
timeline recall at scale + **timezone correctness** (open the Day-of grid — times must match).

## Event 5 — Casual social · "Leo's 30th — Birthday Dinner"
*Style: casual texts, very tentative, then a cancellation. Tests restraint (no fabrication) + replacement.*
**Setup:** birthday · ~20 guests · (budget target optional).

**Input A (paste):**
> "planning leo's 30th! thinking ~20 people, want a nice dinner out. maybe Lola's or that new spot
> Marrow downtown, haven't decided. might do a slideshow of old photos. still need to sort a cake."

**Input B (paste — later):**
> "Lola's is booked solid that night, so we're going with Marrow."

**Expect (A):** **NO** confirmed venue vendor (Lola's/Marrow are tentative → an **open-question/
decision** "venue: Lola's vs Marrow"); slideshow + cake → **tasks/open-questions**; **no**
fabricated budget. **Expect (B):** venue resolves to **Marrow** (decision decided, or Marrow added
now that it's chosen); Lola's never becomes a confirmed/archived vendor (it never was one).
**Audit:** restraint under tentative language; clean resolution on the follow-up.

---

## Appending high-level facts (event date / guest count / budget / location) — built
These live on the **event row**, not the 7 plan tables. They're optional at creation; to change
them after, tell Glenn and approve the review-gated **Event details** card (`event_detail`).

**Test (add to any event — Event 2 is ideal since it had no date):** after Input A, send a
high-level change in Ask Glenn, e.g.:
> "quick update — the wedding is June 20 2026, we're up to 110 guests, and the budget's now $35k."

**Expect:** ONE **Event details** card in Review (indigo, high-stakes section, **not** in "Apply
safe"), showing a before→after diff (Event date: Not set → Jun 20, 2026 · Guest count: 90 → 110 ·
Budget target: $30,000 → $35,000). Approve it **individually**. Then verify the **event row
itself** updated and the Overview countdown/KPIs + day-of grid re-anchor to the real date:
```sql
select event_date, attendee_target, budget_target, location from events where id = 'PASTE-EVENT-ID';
```
**Audit:** event-level vs plan-item disambiguation (a $3,800 catering line must stay a budget_item,
NOT the event budget_target; a "final headcount 2 wks out" deadline must stay a timeline_item, NOT
the event date); only the changed fields update; the card is approved on its own, never in bulk.
**Must NOT:** turn the overall budget into a vendor/budget line, or the event date into a deadline.

## Pass bar
Zero fabricated facts · zero duplicates · corrections update in place · cancellations archive (no
stale committed spend) · packages split into atomic vendor+budget+timeline · tentative language
never becomes a confirmed record · times render in the event's local zone. Bugs found → logged
here / fixed iteratively. (Optional later: `scripts/verify-scenario.ts` for unattended re-runs.)
