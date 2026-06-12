# Glenn Events — 5-Minute MVP Demo Script

The arc: **messy note → review → apply → clarify → correct → remove → replace →
trusted Plan → provenance → Activity.** Every product pillar in one continuous
story, verified end-to-end in manual QA.

**Setup:** logged in, fresh event. Create **"Ava's 30th Birthday Dinner"**
(November 14, The Rose Room, Boston). Demo on desktop.

---

## 1. First open — Glenn greets you (~20s)

Open **Ask Glenn**. Glenn's intake message is already there, naming the event
and asking for vendors, costs, schedule, and unknowns.

> "Glenn already knows the event basics and tells you exactly what it needs.
> No blank-page problem."

## 2. The messy note (~60s)

Paste:

> We're planning Ava's 30th birthday dinner at The Rose Room in Boston on
> November 14. Guests should arrive around 6:30 PM. We want welcome drinks
> from 6:30–7:00, a seated dinner from 7:15–8:45, speeches around 8:30, cake
> around 9:00, and the party should wrap by 10:30 PM. The venue is confirmed.
> The food and beverage minimum is around $4,800. We're also talking to
> Bloom & Co for flowers and table candles, estimated at $1,200. We need to
> confirm the final guest count, vegetarian options, cake delivery timing,
> seating cards, and whether the venue has a microphone for speeches. Main
> risk is the room setup may be tight if we go over 45 guests.

A review batch appears: ~19 ready, several needing answers.

> "Glenn read one paragraph and proposed the whole working plan — timeline,
> vendors, budget, tasks, the capacity risk. Nothing is applied yet."

Click **Apply N safe changes**. Show Plan filling in (Timeline tab is the
most visual).

## 3. Clarify the unknown (~45s)

Paste: *"We also have a photographer coming from 7pm to 9pm. I don't remember
the company name yet, but the estimate is $850."*

Items land in **Needs your answer**. Answer inline:
*"The photographer is North End Photo. Contact is Marco at
marco@northendphoto.com."* Apply the completed items.

> "Glenn asks instead of guessing. Unknowns become questions, not made-up
> facts."

## 4. The correction (~40s)

Paste: *"North End Photo gave us a discount, so the photography price is now
$650 instead of $850."*

The batch shows an **Update budget** row with **$850 → $650** — not a
duplicate. Apply it. Plan → Budget shows $650, one line item.

> "Reality changed, the plan changed — same review gate, no duplicate rows."

## 5. Cancellation + replacement (~50s)

Paste: *"Bloom & Co canceled, so we are not using them anymore."*

A rose **Removals** section appears — excluded from bulk apply on purpose.
Remove deliberately. Bloom & Co disappears from active vendors and budget.

Paste: *"We found a replacement florist called Petal House. They can do
flowers and table candles for $1,000 and will deliver at 5:30 PM."*

Apply — Petal House lands as vendor + budget + delivery timing.

> "Removing something from the plan takes a deliberate click. Nothing is
> hard-deleted — it's all still in the audit trail."

## 6. Provenance (~45s)

Plan → Budget → click **AI source** on the photography item. The drawer opens
in place: the original message, Glenn's proposal and rationale, the
**$850 → $650** diff, who approved it, and the record's history.

> "Every fact in this plan has receipts. This is why you can trust it."

Optional: "Open in Ask Glenn" jumps to the highlighted source message.

## 7. Activity (~20s)

Open **Activity**: corrections show before→after and what fields changed,
removals show the reason, entries note whether a change was a reviewed Glenn
suggestion or a manual edit. Click one — it lands on the record in Plan.

---

## Known traps — do NOT demo these

- **Timeline corrections** ("dinner moved to 7:30") — still creates a
  duplicate row. Fix lands in m15.
- **Vendor cancellation cascade** — archiving Bloom & Co does not yet retire
  its related timeline/setup items. Fix lands in m15. If visible, frame as
  "related-item cleanup is the next milestone."
- **Re-clarifying the same item repeatedly** — earlier pending batches can
  leave fragments. Supersession lands in m16. Dismiss stale batches before
  the demo if any linger.
- Mobile is usable but unpolished — demo on desktop.

## If asked

- **Voice / email?** "Capture channels feed this same review loop — we're
  proving the brain first; channels are plumbing afterward."
- **Replaces spreadsheets / event tools?** "It replaces the retyping. Updates
  become a plan of record with receipts. It's not ticketing, RSVP, or seating
  software."

## Reset

`npm run seed:reset` restores the seeded demo event (predates corrections —
for the full arc, run the live flow above on a fresh event instead).
