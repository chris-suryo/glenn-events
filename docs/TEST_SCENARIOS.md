# Glenn Events — AI-Verified Scenario Tests

> **How this works.** The owner drives the real app (real Glenn, real LLM); Claude verifies the
> result by reading the database directly through the **Supabase MCP** and diffing the actual
> records against the **expected ground truth** below — *semantically* (e.g. "vendor ≈ Petal &
> Stem, cost $650, archived" is correct even if wording varies). This catches the accuracy
> misses a human would have to hunt for, without automating auth or spending on brittle exact-
> match assertions. Project id: `foscibergjhdwqkpsxip`.

## The loop (per scenario)
1. Owner creates a **fresh throwaway event** (never the demo event) and notes its name.
2. Owner pastes the scenario **Input** into Ask Glenn, reviews, and **approves** the proposed
   updates (and sends a screenshot for any visual/time check).
3. Owner tells Claude: *"ran scenario N on event &lt;name&gt;, done."*
4. Claude finds the `event_id`, runs read-only `execute_sql` SELECTs on `proposed_updates` +
   the destination tables (`vendors`, `budget_items`, `timeline_items`, `tasks`, `risks`,
   `decisions`, `open_questions`, `activity_log`), and reports **PASS/FAIL per expectation**
   with the exact mismatch.

**What Claude checks every time:** (a) every expected record exists with the right values;
(b) **nothing fabricated** (no record without a stated fact); (c) **nothing duplicated**;
(d) times stored as the correct instant and rendered in the event's local zone; (e) the source
(`source_message_id` / `ai_run_id`) is attached.

---

## Scenario catalog

### S1 — Multi-fact messy note (recall breadth)
**Input:** "ok so for the june dinner — Chilacates is doing the food, budget cap is like $4k.
need to confirm final headcount with the client by next friday. doors at 6, dinner 7. still not
sure if we're doing a slideshow."
**Expect:** vendor ≈ *Chilacates* (catering); budget cap ≈ **$4,000**; task ≈ confirm headcount
(due ≈ next Friday); timeline items ≈ doors **6:00 PM** + dinner **7:00 PM**; an open question or
decision ≈ slideshow undecided. **No** fabricated vendor/cost.

### S2 — Vendor package (atomic split)
**Input:** "Petal & Stem can do the table flowers and candles for $650 and will deliver at 5:15 PM."
**Expect:** exactly **3** records — vendor *Petal & Stem*; budget line flowers/candles **$650**;
timeline item delivery **5:15 PM** (event-local). Cost/time must be their **own** records, not
folded into the vendor's notes.

### S3 — Time / timezone correctness
**Input:** "AV crew arrives for setup at 3:30 PM, sound check 4:00–4:30 PM."
**Expect:** two timeline items; stored `starts_at` instants correspond to **3:30 PM** and
**4:00–4:30 PM** in the event's timezone; the Day-of grid + List render those exact local times
(screenshot). Fails if they show UTC (e.g. 7:30 PM).

### S4 — Correction (update, not duplicate)
**Setup:** event already has a budget item "Florist — $2,400".
**Input:** "the florist dropped to $2,000."
**Expect:** the **existing** florist budget item is updated to **$2,000** (one row, value
changed) — **no** second florist line. `activity_log` shows a correction, not a fresh apply.

### S5 — Cancellation / replacement
**Input:** "The Meridian Room cancelled. We're booking The Carriage House instead, same date."
**Expect:** Meridian Room vendor **archived** (`archived_at` set); a new vendor ≈ *The Carriage
House*; optionally a risk/task about the change. Old budget tied to Meridian handled (archived
or flagged), not silently left as committed spend.

### S6 — Re-upload / re-paste dedup (the top risk)
**Input:** paste the **same** run-of-show note from a prior scenario again, approve.
**Expect:** **zero** new duplicate timeline items (same title **and** start time already exist).
A same-title item with a *different* time is a **correction**, not a duplicate. (Per the audit,
this is the #1 thing to confirm.)

### S7 — Intake only (no fabrication)
**Input:** "hey can you help me get organized for this event?"
**Expect:** **no** records created at all; Glenn replies with an intake/checklist message only.
Fails if any vendor/task/etc. is invented.

---

## Pass bar (per the pilot audit)
Zero fabricated facts · zero duplicates on re-paste · correct local times · corrections update
in place · accept-rate ≥ ~70% on typed notes. Record results (proposals · accepted · accuracy ·
$/run) in `docs/AI_COST_AUDIT.md`.

## Optional automation (later)
- `scripts/verify-scenario.ts` — given an `event_id` + an expected-outcome JSON, query Supabase
  and print a diff, so the owner/CI can re-verify unattended.
- `scripts/test-extraction.ts` (exists) — property-based checks on extraction without the UI.
