# Glenn Events — Demo Scenarios

Repeatable flows for demos and manual QA. Each exercises the real product end to
end. The 5-minute scripted arc lives in `docs/MVP_DEMO_SCRIPT.md`; this file
collects the larger source-file flows.

For every scenario, **observe the four signals:**
- **Extraction quality** — did Glenn capture the real facts, nothing invented?
- **Review clarity** — is the package card readable, with a clear primary action?
- **Source traceability** — does the source preview + provenance show where each
  fact came from?
- **Cost** — with `NEXT_PUBLIC_SHOW_AI_DEBUG=true`, the per-run token/cost line
  (record in `docs/AI_COST_AUDIT.md`).

Prereqs (see `docs/WORKSPACE.md`): migrations applied, `event-files` bucket,
`ANTHROPIC_API_KEY` set.

---

## 1. Beacon PDF — Quick Demo (works today)

The fastest "source file → plan" proof.

1. Open a seeded event → Event Library.
2. Upload a vendor-quote PDF (e.g. a "Beacon Photo Co" photography quote).
3. Watch status move `extracting → needs_review`.
4. Open the Review package card: confirm vendor + estimated cost + any
   line-items extracted as **pending** proposals.
5. Click the source badge → source preview drawer renders the PDF.
6. Apply the safe changes → confirm they land in Plan, with provenance.

**Observe:** clean extraction of a structured quote; one package card; source
preview; cost line.

---

## 2. Wedding Scenario — Full Outline (ready to run — M22 shipped)

A longer, realistic planning flow that stresses multiple source types,
corrections, and replacements. Run each step as upload/note → Review → apply,
recording cost per run.

1. **Initial wedding notes** (typed) — baseline text extraction.
2. **Venue contract PDF** — package card, source preview, cost.
3. **Caterer PDF** — menu / line-item extraction.
4. **Photographer text-message screenshot (PNG)** — the headline M22 capability.
5. **Florist quote screenshot / PDF** — price extraction from an image.
6. **Budget revision** (typed) — correction / supersession flow.
7. **Vendor cancellation / replacement** — archive + replace proposals.
8. **Final run-of-show PDF** — timeline items.

**Measure:** extraction quality and over-extraction rate (esp. screenshots),
Review package clarity, source traceability across mixed sources, **cost/run**
and **cost/accepted proposal** (`docs/AI_COST_AUDIT.md`), overall demo
readiness. Outcome decides whether screenshot prompting needs tightening before
a live demo.

---

## 3. Screenshot / Text-Message Scenario — Shipped (M22)

Image/screenshot extraction is live as of M22 (`m22-image-extraction-with-ai-debug`,
head `96f38bc`). Upload a screenshot via Event Library, the Ask Glenn paperclip,
or paste it into the composer. With staging, the file previews in the composer
and uploads only on **Tell Glenn**. Target screenshot types and what each yields:

- **Text-message screenshot** — extract the concrete commitment (date, time,
  who); ambiguous/cut-off values → open question, not a guess.
- **Email screenshot** — vendor details, action items.
- **Vendor quote screenshot** — vendor + price; no hallucinated line-items.
- **Menu screenshot** — reasonable menu items; ignore decorative chrome.
- **Logistics / itinerary screenshot** — timeline items.

**M22 manual QA (passed):** image upload extracts into Review; a screenshot of a
PDF extracts correctly; PDF behavior unchanged; the dev cost line appears behind
`NEXT_PUBLIC_SHOW_AI_DEBUG=true`; composer staging works (paste/attach no longer
auto-sends); Event Library reflects processed files. Observed costs in
`docs/AI_COST_AUDIT.md` (≈$0.01–0.02/run on Haiku at ~10–12k tokens). An
unreadable/blurry image degrades to `source_only` — never a silent apply, never
a crash, file stays visible.

**Known UI follow-up (roadmap):** Ask Glenn chat renders a sent image as a
compact file card; inline image previews after send are a later polish item
(see `docs/PRODUCT_CHECKPOINT.md` → Roadmap).

---

> Add new scenarios above this line as capabilities land. Keep each one to:
> setup → numbered steps → what to observe.
