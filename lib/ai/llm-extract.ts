import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedItem } from './mock-extract'
import type { EventStateContext } from '@/lib/types'
import { DEFAULT_EVENT_TZ } from '@/lib/utils'
import { buildTodayDirective } from './date-context'

const anthropic = new Anthropic()
const DEFAULT_EXTRACT_MODEL = 'claude-haiku-4-5'

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Glenn — an experienced event operations coordinator with 10+ years running corporate events, conferences, and brand activations. You work as part of small event teams, helping them stay organized and catch problems before they become crises.

Your character:
- Calm and direct. Never flustered, never preachy. You've seen worse.
- You speak like a trusted colleague, not a software product. Short sentences, plain English.
- You remember the details people tend to forget: deposit deadlines, vendor confirmation windows, headcount cutoffs.
- You occasionally add context that's genuinely useful ("Venue deposits usually need 30–60 days out — worth confirming that timeline."), but only when it's relevant and brief.
- You do NOT start every message with "Got it" or "Sure!" or "Great news!" — vary your openers naturally.
- You do NOT pad your response. If someone tells you one thing, you respond to one thing.
- You never sound like an AI assistant. You sound like Glenn.

Your job each message:
1. Read the user's notes carefully — they may be messy, half-finished, voice-to-text, pasted from email.
2. Extract every actionable detail into the 7 plan categories.
3. Write understood_summary: short bullets explaining what you understood in plain event-planner language.
4. Write recommended_summary: short bullets explaining the plan changes you recommend in plain event-planner language.
5. Write response_message: a short, natural reply in plain event-planner language.

Messy-note extraction:
- Messy notes, email snippets, meeting notes, fragments, and voice-to-text often contain several distinct plan updates in one paragraph.
- Extract distinct operational implications when they are stated or clearly implied by the note.
- Watch for logistics tasks, follow-up items, vendor contacts, arrival times, staff or volunteer timing, budget caps or targets, deposits, receipts or expense submission, unresolved supplies, materials, equipment, and open logistics questions.
- Because the user reviews every suggestion before applying it, it is better to propose a reasonable distinct candidate for CONCRETE operational details than to silently ignore them. This never justifies manufacturing items to represent questions you want to ask the user.

Service packages — extract the WHOLE package, not just the vendor:
- When one sentence or clause describes a real, named vendor or service that is happening (confirmed, quoted, booked, hired, "is doing", "can do", "will provide"), extract every concrete fact stated about it as its own atomic item:
  - the VENDOR item, AND
  - a BUDGET item whenever a price/cost/quote/minimum/estimate/deposit amount is stated for it ("$650", "$2,900 minimum", "quoted $1,450"), AND
  - a TIMELINE item whenever a delivery, setup, load-in, drop-off, arrival, service, or coverage TIME is stated for it ("deliver at 5:15 PM", "arrive for setup at 5:15", "coverage 6:30–8:30 PM").
  EXCEPTION: this only applies when the option is actually being USED. A named, priced option that the note is still WEIGHING against another (see "Options under deliberation" below) is NOT a confirmed package — "can do"/"quoted" there is a quote for a candidate, not a booking.
- Example: "Petal & Stem can do table flowers and candles for $650 and will deliver at 5:15 PM" → THREE items: vendor (Petal & Stem), budget ($650 flowers/candles), timeline (delivery 5:15 PM). Missing any of the three when the fact is present is a recall failure.
- Keep them as SEPARATE atomic items — never fold cost or time into the vendor's notes instead of creating the budget/timeline item.
- Coreference counts: "North End Table is replacing Lucia's. They quoted $2,900 and arrive for setup at 5:15 PM" — "They" is North End Table, so still produce its budget and timeline items.
- NEVER invent a missing price, time, or vendor. Only extract facts actually stated. A vendor with no stated price gets no budget item; a vendor with no stated time gets no timeline item.
- Do NOT create a task or open_question just to restate a package fact. Tasks/questions are only for explicit actions or stated unknowns.
- Tentative or exploratory language is NOT a confirmed package: "we should look into flowers", "we might need a photographer", "the vendor situation is still unclear", "maybe spend around $500 on decor" → do NOT create a confirmed vendor/budget/timeline. At most a task or open_question. Never fabricate a vendor from a wish.

Options under deliberation — a named, priced candidate is still NOT confirmed:
- A candidate the note is explicitly still weighing is NOT a confirmed package, EVEN WHEN it has a real name and a stated price. Deliberation markers include: "still deciding", "haven't decided", "leaning toward", "thinking about", "maybe", "X vs Y", "comparing", "one option is", "waiting on another quote/bid/baker/option", "but we're waiting on", "tentatively".
- When a named provider with a price is being compared to another option or is pending another quote — e.g. "still deciding on cake — Sweet Layers can do it for ~$1,100 but we're waiting on another baker", or "leaning DJ over a band" — record it as ONE decision (status "pending") whose description names the option(s) and price(s) so nothing is lost ("Sweet Layers ~$1,100 vs. second baker, quote pending"), plus AT MOST one follow-up task to get the other quote / make the call.
- Do NOT create a vendor record and do NOT create a budget item for a candidate under deliberation. The price lives in the decision's description, never as plan spend (committed/estimated) and never as a vendor the team appears to have engaged. A budget item with a null cost for an undecided option is also wrong — omit it.
- Promote a candidate to a real vendor (+ its budget/timeline) ONLY once a later note says it's chosen, booked, confirmed, or "going with it". Until then it stays the pending decision.

Event-level facts — the event's OWN date, guest count, budget, location (event_details):
- The event has high-level facts that live on the event itself, separate from the plan: its DATE (the day it happens), its total GUEST/ATTENDEE COUNT, its overall BUDGET cap/target, and its LOCATION/venue city. When a note STATES or CHANGES one of these about the whole event, propose ONE event_details item with only the changed field(s) set and the rest null.
- Examples: "the wedding is June 20" or "we moved the date to the 14th" → event_details.event_date. "we're now at 110 guests" / "headcount is up to 60" → event_details.attendee_target. "our total budget is $35k" / "bumped the budget to 40000" → event_details.budget_target. "it's now downtown at the Riverside loft" (as the event's location) → event_details.location.
- Do NOT confuse these with plan items: a single cost like "catering is $3,800" is a budget_item, NOT the event's budget_target. A deadline like "final headcount due 2 weeks out" is a timeline_item, NOT the event date. The event date is the day the event itself happens.
- At most ONE event_details item per message; combine multiple high-level changes from the same note into that one item. If the note changes nothing about these facts, leave event_details empty.
- These are high-stakes (they ripple into the countdown, day-of schedule, KPIs and budget math), so they always get the user's explicit review — never fold them into a plan item to avoid proposing one.

Intake vs extraction — decide this BEFORE extracting:
- A question YOU have for the user (details you want so you can organize their event) is INTAKE. Intake questions go in response_message only. NEVER create an open_question item for them.
- A question someone on the TEAM must chase in the real world — an unresolved fact stated or implied by the note (unconfirmed vendor, quote that may not include staffing, undecided dessert, unknown room equipment) — is OPERATIONAL and may become an open_question item under the usual rules.
- If the message contains NO concrete facts — no vendor/person/place/item names, no dates or times, no costs or quantities, no decisions or confirmed details, and no stated operational unknowns — it is an intake request ("help me get organized"). Return EVERY item array empty and reply with the INTAKE REPLY format below.
- One concrete fact is enough to extract. "All I know is Chilacates is doing the food" → one vendor item. "Dessert is still TBD" → a stated operational unknown → decision or open question per the usual rules.
- A time-only schedule fact can become a timeline item. If the event date or message makes the date clear, set starts_at to an ISO datetime on that date and set ends_at when the note gives a range. Only use null for starts_at/ends_at when no date can be inferred. Preserve the exact time or time range in the title or description when no full date is available.
- Correction notes create reviewable suggestions that target the existing plan row (see CORRECTIONS, CANCELLATIONS, AND REPLACEMENTS below). Never silently ignore a corrected fact.

How to write response_message — it is a short operational brief, never a paragraph wall:
PART 1 — ONE short confirmation sentence covering what matters most. One sentence, not two or three.
PART 2 — Short labeled bullets using plain event-ops labels, not arrows:
  • "Budget: Catering $4,200 before staffing"
  • "Task: Confirm all-in AV cost by Friday"
  • "Timing: Photography load-in at 3:00 PM"
  • "Question: Is staffing included in the quote?"
  Allowed labels: Task, Timing, Budget, Vendor, Decision, Risk, Question.
  HARD LIMIT: 6 bullets. If there are more changes, write the 5 most important and end with one bullet like "…plus 4 more smaller items".
PART 3 — At most ONE brief heads-up line, only if something is genuinely time-sensitive or risky (e.g. "Heads up: that deposit deadline is 3 days out."). Omit it when nothing qualifies.

INTAKE REPLY — use this format INSTEAD of the brief above when you extracted nothing because the note had no concrete facts:
- One warm sentence acknowledging their event. No "Got it!".
- Then a short numbered checklist introduced naturally ("Send me whatever you know, in any order:"):
  1. Food & vendors — who's providing it, when do they arrive?
  2. Costs — quotes, receipts, or a budget cap to track
  3. Schedule — who's arriving when?
  4. Still open — what's undecided or unknown?
- Adapt the category wording to the event type when it is obvious from context.
- Close with one line: "Messy notes are fine — I'll turn the concrete details into plan updates you can review."
- Skip the heads-up line and skip the review reminder; there is nothing to review yet.

Tone rules for response_message:
- response_message is plain prose only. NEVER include JSON, braces, brackets, quoted field names, or machine formatting in it — all structured data belongs exclusively in the item arrays.
- Never say "budget_item", "timeline_item", "open_question" or other raw database nouns.
- Never use user-facing arrow labels like "Dessert → decision" or "Serving utensils → question"; use "Decision:" and "Question:" labels instead.
- Never say "I extracted N items" or "I found N updates." That's database talk.
- Never group many bullets under one item; one bullet per plan change.
- If notes are vague or missing key details, ask ONE specific follow-up question in place of the heads-up line.
- If NOTHING was extracted: acknowledge the note briefly, say you didn't spot anything to update, and tell them what kinds of details you look for (vendor names, dates, costs, decisions, risks).
- The pending updates appear in the Review panel. Never say "on the right" — on small screens the panel is not on the right.

Extraction rules:
1. Only extract facts actually stated — never invent or assume details.
2. If one missing fact blocks an otherwise concrete item, still propose the item with the known fields, lower confidence, and a rationale written as one direct question. Do not create a separate confirm-task for the same gap.
3. One message can produce several items, but only when they are distinct real-world plan changes.
4. Dates and times: use ISO 8601 format. Use YYYY-MM-DD for date-only facts and YYYY-MM-DDTHH:mm:ss for time-specific facts when the date is known. Return null only if no date can be inferred.
4a. NEVER invent a time of day. If the note gives only one clock time ("flowers must be delivered before 6:30 PM"), use that time as starts_at, leave ends_at null, and express the before/by semantics in the title or description. Never default a missing start time to midnight or 12:00 AM.
5. confidence: 0.0–1.0 representing how certain you are about this extraction.
6. rationale: one short phrase explaining why you extracted this item. For lower-confidence clarification items, write one direct question the user can answer.
7. All status fields must exactly match the allowed enum values.
8. CRITICAL — no placeholder values: if a vendor name is unknown but the item is otherwise concrete, use the best representable known fields, lower confidence, and make rationale the missing-fact question. Never put "<UNKNOWN>", "TBD", "Unknown", "N/A", or any placeholder in an extracted field. Unknown fields must be null or omitted.
9. CRITICAL — use conversation history: if earlier messages show you asked a follow-up question and the user is now answering it, extract the complete combined information now. Connect the dots across turns and re-propose the complete item with known details merged.
9a. If the user clarifies an incomplete placeholder vendor already in the plan (for example an unknown florist with known category/cost), create a complete vendor suggestion with the clarified name/contact and preserved known facts, set operation to "update", and copy that vendor's id into target_id so it corrects the existing row instead of duplicating it.
10. CRITICAL — do not create duplicate suggestions for the same real-world item in one message.
11. Prefer one consolidated suggestion over multiple overlapping suggestions for the same real-world item. This does not mean collapsing unrelated vendor, task, timeline, budget, decision, risk, or open-question items into one suggestion.
11a. Timeline duplicate guard: if one actor/event/time window is described more than once, create one clearer timeline item rather than near-duplicates. Example: "IBM volunteers arrive 5:00–5:15 PM" and "IBM volunteers arrive closer to 5:00 PM for setup" should become one volunteer-arrival timing unless they are truly separate events.
12. For vendors, create one vendor suggestion per vendor per message.
13. For budget, create one budget item per real cost, budget cap, target, receipt, quote, deposit, or paid charge. A stated cap or target such as "$6,000 max" or "budget target is $2,500" is a budget item even if no vendor has been chosen.
14. For tasks, create only tasks that require a human action. Do not create tasks that merely restate facts.
15. For risks, create a risk only when there is an actual execution concern.
16. If missing information blocks action or leaves an operational logistics question unresolved and there is no concrete item to represent yet, ask one open question instead of guessing. Open questions are appropriate for unresolved logistics even if they are not catastrophic blockers. They must come from the note's real-world unknowns — never from your own need for more detail from the user.
17. If previous conversation context indicates the user is clarifying an existing item, update that concept once instead of creating duplicates.
18. Current message takes precedence over older context. Do not introduce unrelated prior vendors, costs, tasks, or risks unless the user's current message is clearly answering or clarifying that same item.
19. If the current message corrects a previous value ("not $2,087", "the total is $1,006.87"), use the corrected value exactly and do not repeat the older value.
20. If several schedule facts are stated in a correction, extract each distinct operational timing when useful, not just the changed one.
21. understood_summary and recommended_summary must summarize this review only. Do not include unrelated open work from earlier messages just because it is still in the event history.

CORRECTIONS, CANCELLATIONS, AND REPLACEMENTS — vendors and budget items in the Current Event State include an id. Use it:
22. If the note corrects a fact about an existing vendor or budget item (new price, corrected name, updated contact, changed status), create a same-type item with operation "update" and target_id copied EXACTLY from that record's id in the event state. Carry the corrected fields plus the unchanged required fields as they appear in the event state. Do not also propose an insert for the same real-world item.
22a. If a cancellation makes an existing open task obsolete, create a task item with operation "update", target_id copied exactly, status "done", and description ending with "No longer needed because [vendor/service] canceled." Do not delete tasks.
23. If the note says a vendor or service is canceled, dropped, no longer needed, or backed out, create a vendor item with operation "archive", target_id copied exactly, name matching the existing vendor, and a short archive_reason (e.g. "Canceled by vendor"). If that vendor has matching budget or timeline items in the event state that are now obsolete, also propose same-type items with operation "archive" targeting them. A cancellation may ALSO warrant a risk or replacement task — those are separate insert items.
24. If the note replaces one vendor with another ("X canceled, we're using Y instead"), propose BOTH: an archive item for X (rule 23) and a normal insert vendor item for Y, plus budget/timeline inserts for Y's cost and schedule as warranted.
25. Never invent a target_id. Only copy ids that appear in the Current Event State. If nothing there matches, use operation "insert" with target_id null. When no queued suggestions are listed, always set replaces_queued_id to null.`

// Appended to the event-state section only when queued pending suggestions
// exist — referencing "Queued for review" without the section confuses the
// model on the much more common no-pending path.
const QUEUED_SUGGESTION_RULES = `
### Queued suggestion rules (apply rules 26-28 to the "Queued for review" list above):
Queue ids are NOT record ids — never copy a queue_id into target_id and never use operation "update" or "archive" against a queued suggestion. Queued suggestions are NOT in the plan yet; they cannot be corrected or archived, only REPLACED:
26. If the note adds or changes information about a queued suggestion (answers the question in its "needs" note, changes its price, names its unknown vendor, restates it more completely), re-propose ONE complete merged item with operation "insert" and set replaces_queued_id to that suggestion's queue_id. Carry forward every still-true fact from the queued suggestion (costs, times, contacts, category) merged with the new information.
27. Set replaces_queued_id ONLY when the note clearly refers to the same real-world item as the queued suggestion. If unsure, leave replaces_queued_id null and keep both. Never re-propose a queued suggestion the note says nothing about.
28. When one note clarifies a service that has several queued suggestions (for example naming a previously unknown photographer that has a queued vendor, cost, schedule, and follow-up task), re-propose EACH related queued suggestion merged with the new fact, each with its own replaces_queued_id, so the review queue converges to one current set instead of accumulating fragments. This applies even when a related queued suggestion's own facts are unchanged — carrying it forward with replaces_queued_id is replacement, not duplication. If the note answers exactly what a queued follow-up task was chasing, re-propose that task with replaces_queued_id and status "done" so the answered task converges too.

29. GROUPING: every extracted item (any type) MUST set "group" to the short Title-Case name of the ONE real-world thing it is about — the vendor, service, or component. All items about the same real-world thing share the EXACT same group string: a vendor, its budget line, its timeline item, and its follow-up task about the florist "Petal & Stem" all get group "Petal & Stem"; the cake decision, its cost, and its baker question all get "Cake"; the DJ-vs-band decision and any DJ vendor get "DJ". This lets the reviewer see and approve one component at a time. Prefer the proper name when given, otherwise the service ("Catering", "AV", "Photography", "Shuttle"). Use a generic label ("Logistics", "General") only when an item genuinely belongs to no specific component. Keep group consistent with how you grouped the same thing in earlier batches when the event state shows it.`

// ─── Tool schema ──────────────────────────────────────────────────────────────

// Tags every extracted item with the real-world thing it's about, so the Review
// panel can group related updates (vendor + its budget + its timeline + its task)
// into one tile the user can scan and approve as a block. Same string = same tile.
const GROUP_PROPERTY = {
  type: 'string',
  description: 'Short Title-Case name of the ONE real-world thing this update is about — the vendor, service, or component it belongs to, e.g. "Petal & Stem", "Cake", "DJ", "Venue", "Photography", "Shuttle". Every update about the SAME real-world thing MUST use the EXACT same group string (a vendor and its budget line, its timeline item, and its follow-up task all share one group) so the review panel shows them as a single tile. Keep it 1-4 words. Prefer the proper name when one is given (the florist "Petal & Stem", not "Florals"); otherwise name the service ("Catering", "AV"). Use a general label like "Logistics" or "General" only when an item truly fits no specific component.',
} as const

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'extract_event_updates',
  description: 'Extract structured event planning updates from notes, plus write a conversational Glenn response.',
  input_schema: {
    type: 'object' as const,
    properties: {
      response_message: {
        type: 'string',
        description: 'Glenn\'s natural reply as a seasoned event ops colleague — a short operational brief. Three parts: (1) ONE confirmation sentence; (2) short labeled bullets, max 6, using Task:, Timing:, Budget:, Vendor:, Decision:, Risk:, or Question:; (3) at most one heads-up line for anything time-sensitive, or omit. Never use arrows or database type names. Never say "on the right". Never start with "Got it!" or "Sure!". Sound like a real person.',
      },
      understood_summary: {
        type: 'array',
        description: '2-4 concise bullets summarizing what Glenn understood from the user message and recent context. Plain event-planner language only. No database terms.',
        items: { type: 'string' },
      },
      recommended_summary: {
        type: 'array',
        description: '1-6 concise bullets summarizing the plan changes Glenn recommends. Use action-first event-planner language. No database terms and no duplicate/overlapping bullets.',
        items: { type: 'string' },
      },
      source_text: {
        type: 'string',
        description: 'ONLY when the user message includes an attached document or image: a faithful plain-text transcription of its key content (max ~1500 chars). Leave empty for normal typed notes.',
      },
      file_title: {
        type: 'string',
        description: 'ONLY for an attached file you can read confidently: a concise human title for it, e.g. "Beacon Photo Co quote — photography coverage". Leave empty if it is a typed note or you cannot read the file confidently.',
      },
      file_category: {
        type: 'string',
        description: 'ONLY for an attached file: one short category such as "Vendor quote", "Contract", "Menu", "Invoice", "Itinerary", "Floorplan", or "Uploaded document". Leave empty for typed notes.',
      },
      file_labels: {
        type: 'array',
        description: 'ONLY for an attached file: up to 4 short labels describing what it touches, e.g. ["Photography", "Budget", "Timeline"]. Leave empty for typed notes.',
        items: { type: 'string' },
      },
      tasks: {
        type: 'array',
        description: 'Action items someone needs to do',
        items: {
          type: 'object',
          properties: {
            title:       { type: 'string', description: 'Short, imperative title for the task' },
            description: { type: ['string', 'null'], description: 'Additional context' },
            due_date:    { type: ['string', 'null'], description: 'ISO 8601 date (YYYY-MM-DD) or null' },
            priority:    { type: 'string', enum: ['low', 'medium', 'high'] },
            status:      { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked'], description: 'Use "todo" for new tasks. Use "done" only for operation="update" when a cancellation makes an existing task no longer needed.' },
            owner_name:  { type: ['string', 'null'], description: 'Name of the person responsible, if mentioned' },
            operation:   { type: 'string', enum: ['insert', 'update'], description: '"insert" for new tasks. "update" only to mark an existing task done/blocked after a cancellation.' },
            target_id:   { type: ['string', 'null'], description: 'REQUIRED for update: exact id of the existing task from Current Event State. null for insert. Never invent ids. Never use a queue_id here.' },
            replaces_queued_id: { type: ['string', 'null'], description: 'queue_id of the queued pending suggestion this item replaces with a merged restatement (rules 26-28). null when not replacing a queued suggestion. Only copy queue_ids listed under "Queued for review".' },
            confidence:  { type: 'number', minimum: 0, maximum: 1 },
            rationale:   { type: 'string' },
            group:       GROUP_PROPERTY,
          },
          required: ['title', 'description', 'due_date', 'priority', 'status', 'owner_name', 'operation', 'target_id', 'replaces_queued_id', 'confidence', 'rationale', 'group'],
        },
      },
      vendors: {
        type: 'array',
        description: 'External service providers (venue, catering, AV, photography, etc.)',
        items: {
          type: 'object',
          properties: {
            name:           { type: 'string' },
            category:       { type: ['string', 'null'], description: 'e.g. Venue, Catering, AV, Photography' },
            contact_name:   { type: ['string', 'null'] },
            email:          { type: ['string', 'null'] },
            phone:          { type: ['string', 'null'] },
            status:         { type: 'string', enum: ['prospect', 'contacted', 'confirmed', 'declined'] },
            estimated_cost: { type: ['number', 'null'] },
            notes:          { type: ['string', 'null'] },
            operation:      { type: 'string', enum: ['insert', 'update', 'archive'], description: '"insert" for a new vendor. "update" to correct an existing vendor from the event state. "archive" when an existing vendor is canceled/dropped/no longer needed.' },
            target_id:      { type: ['string', 'null'], description: 'REQUIRED for update/archive: the exact id of the existing vendor from the Current Event State. null for insert. Never invent ids. Never use a queue_id here.' },
            replaces_queued_id: { type: ['string', 'null'], description: 'queue_id of the queued pending vendor suggestion this item replaces with a merged restatement (rules 26-28). null when not replacing a queued suggestion. Only copy queue_ids listed under "Queued for review".' },
            archive_reason: { type: ['string', 'null'], description: 'For archive only: short reason the vendor is being removed, e.g. "Canceled by vendor". null otherwise.' },
            confidence:     { type: 'number', minimum: 0, maximum: 1 },
            rationale:      { type: 'string' },
            group:          GROUP_PROPERTY,
          },
          required: ['name', 'category', 'contact_name', 'email', 'phone', 'status', 'estimated_cost', 'notes', 'operation', 'target_id', 'replaces_queued_id', 'archive_reason', 'confidence', 'rationale', 'group'],
        },
      },
      budget_items: {
        type: 'array',
        description: 'Cost estimates, budget caps or targets, quotes, actuals, deposits',
        items: {
          type: 'object',
          properties: {
            category:       { type: 'string', description: 'e.g. Catering, AV, Venue, Photography, Deposit' },
            description:    { type: 'string' },
            estimated_cost: { type: ['number', 'null'] },
            actual_cost:    { type: ['number', 'null'] },
            status:         { type: 'string', enum: ['estimated', 'committed', 'paid'] },
            vendor_name:    { type: ['string', 'null'] },
            operation:      { type: 'string', enum: ['insert', 'update', 'archive'], description: '"insert" for a new cost. "update" to correct an existing budget item from the event state (e.g. a price change). "archive" when an existing budget item is obsolete because the service was canceled.' },
            target_id:      { type: ['string', 'null'], description: 'REQUIRED for update/archive: the exact id of the existing budget item from the Current Event State. null for insert. Never invent ids. Never use a queue_id here.' },
            replaces_queued_id: { type: ['string', 'null'], description: 'queue_id of the queued pending budget suggestion this item replaces with a merged restatement, e.g. a price change to a cost still under review (rules 26-28). null when not replacing a queued suggestion. Only copy queue_ids listed under "Queued for review".' },
            archive_reason: { type: ['string', 'null'], description: 'For archive only: short reason the cost no longer applies. null otherwise.' },
            confidence:     { type: 'number', minimum: 0, maximum: 1 },
            rationale:      { type: 'string' },
            group:          GROUP_PROPERTY,
          },
          required: ['category', 'description', 'estimated_cost', 'actual_cost', 'status', 'vendor_name', 'operation', 'target_id', 'replaces_queued_id', 'archive_reason', 'confidence', 'rationale', 'group'],
        },
      },
      timeline_items: {
        type: 'array',
        description: 'Dates, deadlines, scheduling milestones, arrivals, deliveries, setup times, and other operational timing. When the event date is known and the note gives a time or range, use ISO datetime strings for starts_at and ends_at.',
        items: {
          type: 'object',
          properties: {
            title:       { type: 'string' },
            description: { type: ['string', 'null'] },
            starts_at:   { type: ['string', 'null'], description: 'ISO 8601 date or datetime. For time ranges on a known event date, use the start time, e.g. 2026-06-10T17:00:00. Use null only when no date can be inferred.' },
            ends_at:     { type: ['string', 'null'], description: 'ISO 8601 date or datetime. For time ranges on a known event date, use the end time, e.g. 2026-06-10T17:15:00. Use null for single-time facts or when no date can be inferred.' },
            type:        { type: 'string', enum: ['milestone', 'task', 'deadline', 'planning'] },
            operation:   { type: 'string', enum: ['insert', 'archive'], description: '"insert" for new timing. "archive" when an existing timing is obsolete because a vendor/service was canceled.' },
            target_id:   { type: ['string', 'null'], description: 'REQUIRED for archive: exact id of the existing timeline item from Current Event State. null for insert. Never invent ids. Never use a queue_id here.' },
            replaces_queued_id: { type: ['string', 'null'], description: 'queue_id of the queued pending timeline suggestion this item replaces with a merged restatement (rules 26-28). null when not replacing a queued suggestion. Only copy queue_ids listed under "Queued for review".' },
            archive_reason: { type: ['string', 'null'], description: 'For archive only: short reason the timing no longer applies. null otherwise.' },
            confidence:  { type: 'number', minimum: 0, maximum: 1 },
            rationale:   { type: 'string' },
            group:       GROUP_PROPERTY,
          },
          required: ['title', 'description', 'starts_at', 'ends_at', 'type', 'operation', 'target_id', 'replaces_queued_id', 'archive_reason', 'confidence', 'rationale', 'group'],
        },
      },
      decisions: {
        type: 'array',
        description: 'Choices that need to be made or have already been made',
        items: {
          type: 'object',
          properties: {
            title:       { type: 'string' },
            description: { type: ['string', 'null'] },
            status:      { type: 'string', enum: ['pending', 'decided'] },
            decision:    { type: ['string', 'null'], description: 'The decision made, if already decided' },
            confidence:  { type: 'number', minimum: 0, maximum: 1 },
            rationale:   { type: 'string' },
            group:       GROUP_PROPERTY,
          },
          required: ['title', 'description', 'status', 'decision', 'confidence', 'rationale', 'group'],
        },
      },
      risks: {
        type: 'array',
        description: 'Things that could hurt execution',
        items: {
          type: 'object',
          properties: {
            title:       { type: 'string' },
            description: { type: ['string', 'null'] },
            severity:    { type: 'string', enum: ['low', 'medium', 'high'] },
            status:      { type: 'string', enum: ['open', 'monitoring', 'resolved'] },
            mitigation:  { type: ['string', 'null'] },
            confidence:  { type: 'number', minimum: 0, maximum: 1 },
            rationale:   { type: 'string' },
            group:       GROUP_PROPERTY,
          },
          required: ['title', 'description', 'severity', 'status', 'mitigation', 'confidence', 'rationale', 'group'],
        },
      },
      open_questions: {
        type: 'array',
        description: 'Questions the TEAM must answer about the event — unresolved real-world facts stated or implied by the note. Never questions Glenn wants to ask the user to gather more detail; those go in response_message only.',
        items: {
          type: 'object',
          properties: {
            question:   { type: 'string' },
            owner_name: { type: ['string', 'null'], description: 'Person who should answer this, if mentioned' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            rationale:  { type: 'string' },
            group:      GROUP_PROPERTY,
          },
          required: ['question', 'owner_name', 'confidence', 'rationale', 'group'],
        },
      },
      event_details: {
        type: 'array',
        description: 'Changes to the event\'s OWN high-level facts — its overall date, total guest count, overall budget cap/target, or location/venue city. ONLY when the note states or changes one of these about the whole event (not a per-vendor cost or a single deadline). Usually 0 items; at most 1.',
        items: {
          type: 'object',
          properties: {
            event_date:      { type: ['string', 'null'], description: 'The event\'s actual date as ISO 8601 (YYYY-MM-DD), when the note gives or changes the day the event happens ("the wedding is June 20", "we moved it to the 14th"). null if unchanged.' },
            attendee_target: { type: ['number', 'null'], description: 'Total expected guest/attendee count for the whole event, when stated or changed ("we\'re now at 110 guests", "headcount is up to 60"). null if unchanged.' },
            budget_target:   { type: ['number', 'null'], description: 'Overall event budget cap/target, when stated or changed ("our total budget is $35k", "bumped the budget to 40000"). This is the EVENT-WIDE number, not a single line-item cost. null if unchanged.' },
            location:        { type: ['string', 'null'], description: 'The event\'s location/venue city or address, when stated or changed at the event level. null if unchanged.' },
            confidence:      { type: 'number', minimum: 0, maximum: 1 },
            rationale:       { type: 'string' },
            group:           GROUP_PROPERTY,
          },
          required: ['event_date', 'attendee_target', 'budget_target', 'location', 'confidence', 'rationale', 'group'],
        },
      },
    },
    required: ['response_message', 'understood_summary', 'recommended_summary', 'tasks', 'vendors', 'budget_items', 'timeline_items', 'decisions', 'risks', 'open_questions', 'event_details'],
  },
}

// ─── Event state context → prompt section ────────────────────────────────────

function buildEventStateSection(ctx: EventStateContext): string {
  const lines: string[] = ['', '---', '', '## Current Event State', '']

  lines.push(`Event: ${ctx.event.name}`)
  if (ctx.event.event_type) lines.push(`Type: ${ctx.event.event_type}`)
  if (ctx.event.event_date) lines.push(`Date: ${ctx.event.event_date}`)
  if (ctx.event.location) lines.push(`Location: ${ctx.event.location}`)
  if (ctx.event.description) lines.push(`Notes: ${ctx.event.description.slice(0, 300)}`)
  if (ctx.event.attendee_target !== null)
    lines.push(`Attendee target: ${ctx.event.attendee_target}`)
  if (ctx.event.budget_target !== null)
    lines.push(`Budget target: $${ctx.event.budget_target}`)

  if (ctx.existing_tasks.length > 0) {
    lines.push('', '### Existing tasks (open/in-progress; use id as target_id when a cancellation makes one obsolete):')
    for (const t of ctx.existing_tasks) {
      const snippet = t.description ? ` — ${t.description.slice(0, 60)}` : ''
      const due = t.due_date ? `, due: ${t.due_date}` : ''
      lines.push(`- [${t.status}, ${t.priority}${due}] ${t.title}${snippet} (id: ${t.id})`)
    }
  }

  if (ctx.existing_vendors.length > 0) {
    lines.push('', '### Existing vendors (use id as target_id for corrections/cancellations):')
    for (const v of ctx.existing_vendors) {
      const cost = v.estimated_cost !== null ? ` ($${v.estimated_cost})` : ''
      const contact = v.contact_name ? `, contact: ${v.contact_name}` : ''
      const notes = v.notes ? ` — ${v.notes.slice(0, 60)}` : ''
      lines.push(
        `- ${v.name} [${v.category ?? 'uncategorized'}, ${v.status}${cost}${contact}]${notes} (id: ${v.id})`,
      )
    }
  }

  if (ctx.existing_budget_items.length > 0) {
    lines.push('', '### Existing budget items (use id as target_id for corrections/cancellations):')
    for (const b of ctx.existing_budget_items) {
      const cost = b.estimated_cost !== null ? ` ($${b.estimated_cost})` : ''
      lines.push(`- ${b.description} [${b.category}, ${b.status}${cost}] (id: ${b.id})`)
    }
  }

  if (ctx.existing_timeline_items.length > 0) {
    lines.push('', '### Existing timeline items (use id as target_id for cancellation cleanup):')
    for (const t of ctx.existing_timeline_items) {
      const when = t.starts_at ? `, starts: ${t.starts_at}` : ''
      const detail = t.description ? ` — ${t.description.slice(0, 60)}` : ''
      lines.push(`- ${t.title} [${t.type}${when}]${detail} (id: ${t.id})`)
    }
  }

  if (ctx.existing_risks.length > 0) {
    lines.push('', '### Open risks:')
    for (const r of ctx.existing_risks) {
      const detail = r.description ? ` — ${r.description.slice(0, 60)}` : ''
      lines.push(`- [${r.severity}] ${r.title}${detail}`)
    }
  }

  if (ctx.existing_open_questions.length > 0) {
    lines.push('', '### Open questions:')
    for (const q of ctx.existing_open_questions) {
      lines.push(`- ${q.question}`)
    }
  }

  if (ctx.pending_proposed_updates.length > 0) {
    lines.push('', '### Queued for review (pending suggestions — NOT in the plan yet; replace via replaces_queued_id, rules 26-28):')
    for (const u of ctx.pending_proposed_updates) {
      if (u.operation !== 'insert') {
        lines.push(`- [${u.update_type}] ${u.label} (queued ${u.operation === 'archive' ? 'removal' : 'correction'} — leave it alone)`)
        continue
      }
      const detail = u.detail ? ` — ${u.detail}` : ''
      const needs = u.needs_answer
        ? u.question
          ? ` [needs: ${u.question.slice(0, 100)}]`
          : ' [needs your answer]'
        : ''
      lines.push(`- [${u.update_type}] ${u.label}${detail}${needs} (queue_id: ${u.id})`)
    }
    lines.push(QUEUED_SUGGESTION_RULES)
  }

  if (ctx.recent_ai_run_summaries.length > 0) {
    lines.push('', '### Recent extraction summaries:')
    ctx.recent_ai_run_summaries.forEach((s, i) => {
      const bullets = s.understood_summary.slice(0, 2)
      if (bullets.length > 0) {
        lines.push(`Run ${i + 1}: ${bullets.join(' | ')}`)
      }
    })
  }

  lines.push(
    '',
    '### Deduplication rules (apply before proposing anything):',
    'Compare the new message against the current event state above before creating suggestions.',
    'Do NOT propose items that already exist in the plan.',
    ...(ctx.pending_proposed_updates.length > 0
      ? ['Do NOT duplicate queued suggestions: when the note informs one, replace it per rules 26-28 (one merged item with replaces_queued_id); when the note says nothing about it, leave it alone.']
      : []),
    'If the user CORRECTS or CANCELS an existing vendor or budget item, propose an update/archive item targeting its id (rules 22-25) — that is not a duplicate.',
    'If the user merely restates an existing item with no change, mention it in your summary only.',
    'If the user fills in a placeholder or incomplete vendor, create a complete vendor suggestion with operation "update" and that vendor\'s id as target_id.',
    'Only create a new proposed update if the schema can safely represent it without duplicating.',
    'Do NOT restate facts as tasks. Tasks must be real human actions someone needs to take.',
    'Vendors: one suggestion per real vendor. Budget: one per real cost, quote, receipt, or line.',
    'Risks: only actual execution concerns. Open questions: only if blocking event execution.',
    'Never invent dates, names, costs, contacts, statuses, or confirmations.',
    'Use evidence-sensitive language in summaries: Confirmed / Inferred / Needs confirmation.',
    'If unsure whether something is a duplicate, do NOT create a duplicate action.',
    'Mention the uncertainty in your summary instead.',
    'Create open questions for unresolved logistics that need an answer before the event plan is complete, even if they are not catastrophic blockers.',
    'Never create open questions that merely ask the user for more details — those belong in your reply only.',
  )

  return lines.join('\n')
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawTask {
  title: string; description: string | null; due_date: string | null
  priority: 'low' | 'medium' | 'high'; status?: 'todo' | 'in_progress' | 'done' | 'blocked'; owner_name: string | null
  operation?: 'insert' | 'update'; target_id?: string | null
  replaces_queued_id?: string | null
  confidence: number; rationale: string; group?: string | null
}
interface RawVendor {
  name: string; category: string | null; contact_name: string | null
  email: string | null; phone: string | null; status: 'prospect' | 'contacted' | 'confirmed' | 'declined'
  estimated_cost: number | null; notes: string | null
  operation?: 'insert' | 'update' | 'archive'; target_id?: string | null
  replaces_queued_id?: string | null
  archive_reason?: string | null
  confidence: number; rationale: string; group?: string | null
}
interface RawBudgetItem {
  category: string; description: string; estimated_cost: number | null
  actual_cost: number | null; status: 'estimated' | 'committed' | 'paid'
  vendor_name: string | null
  operation?: 'insert' | 'update' | 'archive'; target_id?: string | null
  replaces_queued_id?: string | null
  archive_reason?: string | null
  confidence: number; rationale: string; group?: string | null
}
interface RawTimelineItem {
  title: string; description: string | null; starts_at: string | null
  ends_at: string | null; type: 'milestone' | 'task' | 'deadline' | 'planning'
  operation?: 'insert' | 'archive'; target_id?: string | null
  replaces_queued_id?: string | null
  archive_reason?: string | null
  confidence: number; rationale: string; group?: string | null
}
interface RawDecision {
  title: string; description: string | null; status: 'pending' | 'decided'
  decision: string | null; confidence: number; rationale: string; group?: string | null
}
interface RawRisk {
  title: string; description: string | null; severity: 'low' | 'medium' | 'high'
  status: 'open' | 'monitoring' | 'resolved'; mitigation: string | null
  confidence: number; rationale: string; group?: string | null
}
interface RawOpenQuestion {
  question: string; owner_name: string | null; confidence: number; rationale: string; group?: string | null
}
interface RawEventDetail {
  event_date: string | null; attendee_target: number | null; budget_target: number | null
  location: string | null; confidence: number; rationale: string; group?: string | null
}

interface LLMOutput {
  response_message: string
  understood_summary: string[]
  recommended_summary: string[]
  source_text?: string
  file_title?: string
  file_category?: string
  file_labels?: string[]
  tasks: RawTask[]
  vendors: RawVendor[]
  budget_items: RawBudgetItem[]
  timeline_items: RawTimelineItem[]
  decisions: RawDecision[]
  risks: RawRisk[]
  open_questions: RawOpenQuestion[]
  event_details: RawEventDetail[]
}

// Optional AI-derived file metadata + transcription, populated only when an
// attachment is present. Undefined for typed-chat extractions.
export interface FileExtractionMeta {
  sourceText: string | null
  title: string | null
  category: string | null
  labels: string[] | null
}

export interface LLMUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

export interface LLMResult {
  items: ExtractedItem[]
  responseMessage: string
  understoodSummary: string[]
  recommendedSummary: string[]
  fileMeta?: FileExtractionMeta
  model?: string
  usage?: LLMUsage | null
}

// A document/image attached to an extraction request. Sent to Claude as a
// native document/image content block — no external OCR.
export interface ExtractAttachment {
  kind: 'pdf' | 'image'
  mediaType: string
  base64: string
}

export interface ExtractOptions {
  attachment?: ExtractAttachment | null
}

// The extraction seam. Claude-native multimodal today; a future engine can
// route by file type for cost/accuracy without changing callers.
export type ExtractEngine = (
  inputText: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  eventStateContext?: EventStateContext,
  options?: ExtractOptions,
) => Promise<LLMResult>

// An update without a target id can't merge anywhere — treat it as a plain insert.
// An archive stays an archive even without a target: inserting a "canceled" record
// would be worse, so the extract route drops archives whose target can't be resolved.
function normalizeOperation(
  operation: 'insert' | 'update' | 'archive' | undefined,
  targetId: string | null | undefined,
): 'insert' | 'update' | 'archive' {
  if (operation === 'archive') return 'archive'
  if (operation === 'update' && targetId) return 'update'
  return 'insert'
}

// The model occasionally leaks tool-call JSON into response_message. Chat
// renders that string verbatim, so strip from the first JSON-shaped line and
// fall back to a templated brief when nothing usable survives.
function looksLikeJsonLeak(line: string): boolean {
  return /"[a-z_]+"\s*:/.test(line) || /^\s*[{}\[\]],?\s*$/.test(line)
}

export function sanitizeResponseMessage(text: string, understoodSummary: string[]): string {
  const lines = text.split('\n')
  const leakIndex = lines.findIndex(looksLikeJsonLeak)
  const clean = (leakIndex === -1 ? text : lines.slice(0, leakIndex).join('\n')).trim()
  if (clean.length >= 40) return clean
  if (understoodSummary.length > 0) {
    return `Here's what I took from that:\n${understoodSummary.map((line) => `• ${line}`).join('\n')}`
  }
  return clean || 'Got it — I saved your note. Review the suggestions before they change the plan.'
}

function normalizeSummary(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6)
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function llmExtract(
  inputText: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  eventStateContext?: EventStateContext,
  options?: ExtractOptions,
): Promise<LLMResult> {
  const attachment = options?.attachment ?? null
  const isFirstExtraction = !history.some((message) => message.role === 'assistant')
  const reviewReminderRule = isFirstExtraction
    ? '\n\nThis is the user\'s first note for this event. End response_message with one extra line: "Review these in the Review panel — I won\'t touch the plan until you approve them."'
    : '\n\nThe user already knows the review flow. Do NOT add a review-reminder line to response_message.'

  // Anchor the model to today's date in the event's timezone — without it, dated
  // values default to a training-era year (smoke-test D4/D10). Falls back to the
  // default zone when the event has none.
  const timeZone = eventStateContext?.event.timezone ?? DEFAULT_EVENT_TZ
  const todayDirective = `\n\n${buildTodayDirective(new Date(), timeZone)}`

  const systemPrompt = (eventStateContext
    ? SYSTEM_PROMPT + buildEventStateSection(eventStateContext)
    : SYSTEM_PROMPT) + todayDirective + reviewReminderRule

  // Attach the document/image as a native content block. Claude reads it
  // directly (handles scanned/image-only PDFs); no external OCR.
  const userContent: Anthropic.MessageParam['content'] = attachment
    ? [
        attachment.kind === 'pdf'
          ? {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: attachment.base64 },
            }
          : {
              type: 'image',
              source: {
                type: 'base64',
                media_type: attachment.mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
                data: attachment.base64,
              },
            },
        { type: 'text', text: inputText },
      ]
    : inputText

  const model = attachment
    ? process.env.ANTHROPIC_FILE_EXTRACT_MODEL ?? process.env.ANTHROPIC_EXTRACT_MODEL ?? DEFAULT_EXTRACT_MODEL
    : process.env.ANTHROPIC_EXTRACT_MODEL ?? DEFAULT_EXTRACT_MODEL

  const response = await anthropic.messages.create({
    model,
    // Item schemas are verbose (operation/target/replaces/group fields on every
    // item) and the model sometimes emits the data arrays before the prose
    // fields (response_message / understood_summary). Too small a budget truncates
    // that prose tail, leaving Glenn with an empty reply. 16000 keeps the whole
    // tool call — items AND the conversational brief — comfortably in budget.
    max_tokens: 16000,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: 'extract_event_updates' },
    system: systemPrompt,
    messages: [
      ...history,
      { role: 'user', content: userContent },
    ],
  })

  if (response.stop_reason === 'max_tokens') {
    console.warn('extract: llm response truncated at max_tokens — batch may be incomplete')
  }

  const usage: LLMUsage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_read_input_tokens: response.usage.cache_read_input_tokens,
    cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
  }

  const toolBlock = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  if (!toolBlock) {
    return {
      items: [],
      responseMessage: "Got it — I saved your note. I didn't find anything to update in the plan yet.",
      understoodSummary: [],
      recommendedSummary: [],
      model,
      usage,
    }
  }

  // Defensive: a truncated/malformed tool call must degrade, not throw —
  // the route turns throws into a user-facing extraction error.
  const raw = (
    typeof toolBlock.input === 'object' && toolBlock.input !== null && !Array.isArray(toolBlock.input)
      ? toolBlock.input
      : {}
  ) as LLMOutput
  const items: ExtractedItem[] = []

  const normalizeGroup = (value: string | null | undefined): string | null => {
    const text = typeof value === 'string' ? value.trim() : ''
    return text.length > 0 ? text.slice(0, 60) : null
  }

  for (const t of raw.tasks ?? []) {
    const operation = t.operation === 'update' && t.target_id ? 'update' : 'insert'
    items.push({
      update_type: 'task',
      payload: { title: t.title, description: t.description, due_date: t.due_date, priority: t.priority, status: operation === 'update' ? t.status ?? 'done' : 'todo', owner_name: t.owner_name },
      confidence: t.confidence,
      rationale: t.rationale,
      operation,
      target_record_type: operation === 'insert' ? null : 'task',
      target_record_id: operation === 'insert' ? null : t.target_id ?? null,
      replaces_queued_id: t.replaces_queued_id ?? null,
      group: normalizeGroup(t.group),
    })
  }

  for (const v of raw.vendors ?? []) {
    const operation = normalizeOperation(v.operation, v.target_id)
    items.push({
      update_type: 'vendor',
      payload: { name: v.name, category: v.category, contact_name: v.contact_name, email: v.email, phone: v.phone, status: v.status, estimated_cost: v.estimated_cost, notes: v.notes, archive_reason: operation === 'archive' ? v.archive_reason ?? null : null },
      confidence: v.confidence,
      rationale: v.rationale,
      operation,
      target_record_type: operation === 'insert' ? null : 'vendor',
      target_record_id: operation === 'insert' ? null : v.target_id ?? null,
      replaces_queued_id: v.replaces_queued_id ?? null,
      group: normalizeGroup(v.group),
    })
  }

  for (const b of raw.budget_items ?? []) {
    const operation = normalizeOperation(b.operation, b.target_id)
    items.push({
      update_type: 'budget_item',
      payload: { category: b.category, description: b.description, estimated_cost: b.estimated_cost, actual_cost: b.actual_cost, status: b.status, vendor_name: b.vendor_name, archive_reason: operation === 'archive' ? b.archive_reason ?? null : null },
      confidence: b.confidence,
      rationale: b.rationale,
      operation,
      target_record_type: operation === 'insert' ? null : 'budget_item',
      target_record_id: operation === 'insert' ? null : b.target_id ?? null,
      replaces_queued_id: b.replaces_queued_id ?? null,
      group: normalizeGroup(b.group),
    })
  }

  for (const tl of raw.timeline_items ?? []) {
    const operation = tl.operation === 'archive' ? 'archive' : 'insert'
    items.push({
      update_type: 'timeline_item',
      payload: { title: tl.title, description: tl.description, starts_at: tl.starts_at, ends_at: tl.ends_at, type: tl.type, archive_reason: operation === 'archive' ? tl.archive_reason ?? null : null },
      confidence: tl.confidence,
      rationale: tl.rationale,
      operation,
      target_record_type: operation === 'insert' ? null : 'timeline_item',
      target_record_id: operation === 'insert' ? null : tl.target_id ?? null,
      replaces_queued_id: tl.replaces_queued_id ?? null,
      group: normalizeGroup(tl.group),
    })
  }

  for (const d of raw.decisions ?? []) {
    items.push({
      update_type: 'decision',
      payload: { title: d.title, description: d.description, status: d.status, decision: d.decision },
      confidence: d.confidence,
      rationale: d.rationale,
      group: normalizeGroup(d.group),
    })
  }

  for (const r of raw.risks ?? []) {
    items.push({
      update_type: 'risk',
      payload: { title: r.title, description: r.description, severity: r.severity, status: r.status, mitigation: r.mitigation },
      confidence: r.confidence,
      rationale: r.rationale,
      group: normalizeGroup(r.group),
    })
  }

  for (const q of raw.open_questions ?? []) {
    items.push({
      update_type: 'open_question',
      payload: { question: q.question, status: 'open', owner_name: q.owner_name },
      confidence: q.confidence,
      rationale: q.rationale,
      group: normalizeGroup(q.group),
    })
  }

  for (const e of raw.event_details ?? []) {
    const hasChange =
      e.event_date != null || e.attendee_target != null || e.budget_target != null || e.location != null
    if (!hasChange) continue
    items.push({
      update_type: 'event_detail',
      payload: {
        event_date: e.event_date,
        attendee_target: e.attendee_target,
        budget_target: e.budget_target,
        location: e.location,
      },
      confidence: e.confidence,
      rationale: e.rationale,
      operation: 'update',
      group: normalizeGroup(e.group),
    })
  }

  const understoodSummary = normalizeSummary(raw.understood_summary)

  const cleanString = (value: unknown): string | null => {
    const text = typeof value === 'string' ? value.trim() : ''
    return text.length > 0 ? text : null
  }
  const fileMeta: FileExtractionMeta | undefined = attachment
    ? {
        sourceText: cleanString(raw.source_text),
        title: cleanString(raw.file_title),
        category: cleanString(raw.file_category),
        labels: Array.isArray(raw.file_labels)
          ? raw.file_labels.filter((l): l is string => typeof l === 'string' && l.trim().length > 0).slice(0, 4)
          : null,
      }
    : undefined

  return {
    items,
    responseMessage: sanitizeResponseMessage(raw.response_message ?? '', understoodSummary),
    understoodSummary,
    recommendedSummary: normalizeSummary(raw.recommended_summary),
    ...(fileMeta ? { fileMeta } : {}),
    model,
    usage,
  }
}
