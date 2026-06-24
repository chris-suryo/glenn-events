# Glenn Events — AI-Verified Scenario Tests

> **How this works.** The owner drives the real app (real Glenn, real LLM); Claude verifies by
> reading the database through the **Supabase MCP** (project `foscibergjhdwqkpsxip`) and diffing
> the actual records against the **expected ground truth** below — *semantically*. This catches
> the accuracy misses a human would have to hunt for. (To enable Claude's read access, see
> "How to approve the Supabase access" in chat / add `mcp__Supabase__execute_sql` to
> `.claude/settings.json` `permissions.allow`.)
>
> **Inputs are deliberately messy** — real texts, forwarded emails, voice-to-text — because
> that's what the product must handle. Each scenario lists what **must** appear, what must be
> **updated not duplicated**, and what must **NOT** be fabricated.

## The loop
1. Owner runs the input(s) in Ask Glenn on the named event, reviews, **approves**, sends a
   screenshot for any time/visual check, and says *"done — event &lt;name&gt;, step N."*
2. Claude reads `proposed_updates` + destination tables for that `event_id` and reports
   **PASS/FAIL per expectation** with the exact mismatch. Always checked: nothing fabricated,
   nothing duplicated, times in the event's local zone, source attached.

---

## ⭐ Arc A — "The Foundry Dinner" (run these 6 in order, on ONE fresh event)

This is the primary test: a realistic planning thread where later messages must correct,
cancel, and de-duplicate against the state earlier messages created. Create one fresh event
(any name, event_date ~6 weeks out, set a budget target like $12,000), then paste each step.

**A1 — post-walkthrough brain dump (recall breadth + package split)**
> "just left the walkthrough. room holds 60, we're at 48 — they need final headcount 10 days
> out. catering's in-house, chef quoted $85/head so ~$4,080, includes dessert but NOT service
> staff ($35/hr per server, need 4 for 5 hours). AV is bring-your-own so I have to call
> Crescendo about mics + a screen. parking is street-only, might need valet. and they hold the
> date with a 50% deposit — $1,500 — due by the 15th or we lose it."

Expect: venue vendor (in-house catering noted); **budget catering ≈ $4,080**; a **service-staff**
cost or task (**$700** = 35×4×5) — *separate*, not folded into catering; **task** call Crescendo
(AV: mics + screen); **task/open-question** valet quote; **deadline** final headcount (~10 days
out); **deadline/task** deposit **$1,500** due the 15th; **risk** street-only parking. No invented
prices.

**A2 — forwarded vendor email (coreference + package → 3+ atomic records)**
> "fwd: 'Confirming Lumen Photo — 6 hours, 2 shooters, online gallery in 3 weeks, $2,400.
> We'll arrive an hour before for setup. 50% retainer holds the date, balance day-of. Let us
> know on the engagement-session add-on (+$600).'"

Expect: **vendor** Lumen Photo (photography); **budget** photography **$2,400**; **timeline**
arrive **1 hr before** (setup); **task/budget** 50% retainer (**$1,200**); **decision/open-question**
engagement add-on **+$600** (pending). "We" = Lumen Photo.

**A3 — correction (update in place, NOT a duplicate)**
> "good news, catering came down — chef will do $75/head, and service staff is now included."

Expect: the **existing catering budget updates to ≈ $3,600** (75×48) — *one* row, value changed;
the separate **service-staff cost is removed/zeroed or archived** (now included). **No** second
catering line. `activity_log` shows a correction.

**A4 — cancellation + replacement (cascade, no silent stale spend)**
> "venue fell through — they double-booked us. moving to The Foundry, same date. our deposit's
> refundable thank god, and Lumen + Crescendo still work for the new room."

Expect: original venue **archived** (`archived_at` set); **new vendor** The Foundry; the venue
**deposit/budget** archived or flagged (not left as live committed spend); Lumen/Crescendo
untouched. Optionally a **risk/task** about the move. Nothing fabricated about The Foundry beyond
"new venue, same date."

**A5 — re-paste the A1 dump verbatim (dedup — the #1 risk)**
> *(paste A1 again, approve)*

Expect: **zero** new duplicate records — same-title **and** same-time/value items already exist
and must be dropped. (A same title with a *different* value would be a correction, not a dup.)

**A6 — tentative language (must NOT fabricate)**
> "might add a photo booth, maybe ~$500 on decor, still need to look into transport for the
> out-of-town folks."

Expect: **NO** confirmed vendor or committed budget. At most **tasks/open-questions** (look into
photo booth; decor ~$500 as a *target/question*; transport task). **FAIL** if a "Photo Booth"
vendor or a committed $500 budget line appears.

---

## Standalone behavioral scenarios (each on its own fresh event)

**B1 — voice-to-text run-on (separate decisions / tentative / hard constraint)**
> "um so we picked gold and white, linens are through the venue, still figuring out the cake —
> Sweet Layers can do it for like 900 but the other baker hasn't replied, thinking DJ over a
> band, and the toast is 8 sharp bc the GM leaves at 830"

Expect: **decision** colors gold/white (decided); **open-question/decision** cake (Sweet Layers
~$900 vs pending other) — not a confirmed vendor yet; **task/decision** music DJ-vs-band
(leaning DJ, not a confirmed vendor); **timeline** toast **8:00 PM**; **risk/constraint** GM
departs **8:30** (remarks must end before). Linens = a note, not a vendor.

**B2 — mixed signal: real fact vs. gossip (separation)**
> "great news — the band confirmed, $3,200! weather looks iffy that weekend. Sarah said her
> cousin does calligraphy. parking's still a question mark."

Expect: **vendor** band (confirmed) + **budget $3,200**; **risk** weather; **task/open-question**
calligraphy (tentative — *not* a confirmed vendor); **open-question** parking. The confirmed
fact and the hearsay must be classified differently.

**B3 — intake only (zero fabrication)**
> "hey can you help me get organized? not really sure where to start."

Expect: **no records created at all** — an intake/checklist reply only. Any vendor/task invented
= FAIL.

**B4 — time / timezone correctness (verify stored instant + rendered local time)**
> "AV crew load-in 3:30 PM, sound check 4:00–4:30, doors 6."

Expect: timeline items whose stored `starts_at` instants map to **3:30**, **4:00–4:30**, **6:00
PM** in the event's timezone; the Day-of grid + List render those exact local times (screenshot).
FAIL if shown in UTC.

---

## What "pass" means (per the pilot audit)
Zero fabricated facts · zero duplicates on re-paste · corrections update in place · cancellations
archive (no stale committed spend) · correct local times · packages split into atomic
vendor+budget+timeline · tentative language never becomes a confirmed record. Log results
(proposals · accepted · accuracy · $/run) in `docs/AI_COST_AUDIT.md`.

## Optional automation (later)
- `scripts/verify-scenario.ts` — `event_id` + expected-outcome JSON → DB diff the owner/CI runs
  unattended (also the path if MCP access stays closed).
- `scripts/test-extraction.ts` (exists) — extraction property checks without the UI.
