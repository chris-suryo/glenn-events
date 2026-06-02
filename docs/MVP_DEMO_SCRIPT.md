# Glenn Events — 3-Minute MVP Demo Script

**Setup:** Log in as `dev@example.com` / `devpassword123`. Open the Q3 Client Networking Dinner event.

---

## 1. Set the scene (~30s)

Open the **Command Center**. Walk through the header strip:

> "This is the Q3 Client Networking Dinner — Sep 27, Boston, 85 attendees. Glenn has already loaded the event brief, open tasks, vendor status, budget, and risks. Everything in one place."

Point out the stats row: open tasks, vendors confirmed vs. total, budget committed, open risks, open questions.

---

## 2. Glenn extracts structure from messy notes (~60s)

Click into the **Tell Glenn** input. Paste or type:

> "The venue confirmed they need the final headcount 10 days before the dinner. Catering came back at $4,200 before staffing and gratuity, so we need to confirm the all-in number. Sarah is checking AV because the package is still unclear. Photography is tentatively held but needs a deposit by Friday."

Click **Tell Glenn**.

> "That's a typical Friday afternoon update — scattered, mixed with context. Watch what Glenn does with it."

The badge appears: **Glenn found 9 proposed updates.**

---

## 3. Review Glenn's proposed updates (~45s)

Click **Chat** in the sidebar. The message appears in the thread. The right panel shows 9 structured cards:

- **Timeline** — Final headcount due to venue
- **Task** — Confirm final headcount
- **Budget** — Catering quote: $4,200
- **Task** — Confirm all-in catering cost
- **Open question** — Does the catering quote include staffing and gratuity?
- **Risk** — Catering cost may exceed estimate
- **Task** — Sarah to confirm AV package
- **Vendor** — Photography (Contacted)
- **Task** — Pay photography deposit

> "Glenn didn't just save the message — it extracted every actionable item. Each one is a proposed update, not yet applied. You're in control of what goes into the plan."

---

## 4. Apply and reject (~30s)

Click **Apply** on the Timeline item.

> "Applied. The headcount deadline is now in your Timeline."

Click **Reject** on one of the duplicate Task cards.

> "Rejected. Doesn't touch the plan. Nothing gets in without your approval."

Click **Approve all** on the remaining cards.

> "Everything else goes in. Tasks, budget, vendor, risk, open question — all written to the event plan of record."

---

## 5. Show the results (~15s)

Navigate to:
- **Tasks** — new AI-generated tasks visible with AI badge
- **Budget** — catering line item at $4,200 appears
- **Timeline** — "Final headcount due to venue" deadline added

Back on the **Command Center**, scroll to **Recent activity**:

> "Glenn logs every action. You can see what was proposed, what was applied, what was rejected — full traceability."

---

## Key talking points

- **Glenn proposes, you decide.** Nothing touches the plan without approval.
- **Zero data entry.** Paste notes → structured plan.
- **Traceability.** Every AI-generated record knows its source message and ai_run.
- **Any input format.** Email threads, Slack pastes, voice transcripts — Glenn handles the mess.

---

## Demo reset

If you need a clean slate:

```bash
npm run seed:reset
```

This deletes the existing Q3 Networking Dinner event and all its data, then re-seeds fresh fixture data. The demo user account is preserved.
