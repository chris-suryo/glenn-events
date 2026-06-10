import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedItem } from './mock-extract'
import type { EventStateContext } from '@/lib/types'

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

Intake vs extraction — decide this BEFORE extracting:
- A question YOU have for the user (details you want so you can organize their event) is INTAKE. Intake questions go in response_message only. NEVER create an open_question item for them.
- A question someone on the TEAM must chase in the real world — an unresolved fact stated or implied by the note (unconfirmed vendor, quote that may not include staffing, undecided dessert, unknown room equipment) — is OPERATIONAL and may become an open_question item under the usual rules.
- If the message contains NO concrete facts — no vendor/person/place/item names, no dates or times, no costs or quantities, no decisions or confirmed details, and no stated operational unknowns — it is an intake request ("help me get organized"). Return EVERY item array empty and reply with the INTAKE REPLY format below.
- One concrete fact is enough to extract. "All I know is Chilacates is doing the food" → one vendor item. "Dessert is still TBD" → a stated operational unknown → decision or open question per the usual rules.
- A time-only schedule fact can become a timeline item. If the event date or message makes the date clear, set starts_at to an ISO datetime on that date and set ends_at when the note gives a range. Only use null for starts_at/ends_at when no date can be inferred. Preserve the exact time or time range in the title or description when no full date is available.
- Correction notes should still create reviewable suggestions that capture corrected schedule, budget, and task facts. This app does not merge into existing plan rows yet, so phrase them as candidate updates or correction tasks rather than silently ignoring them.

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
- Never say "budget_item", "timeline_item", "open_question" or other raw database nouns.
- Never use user-facing arrow labels like "Dessert → decision" or "Serving utensils → question"; use "Decision:" and "Question:" labels instead.
- Never say "I extracted N items" or "I found N updates." That's database talk.
- Never group many bullets under one item; one bullet per plan change.
- If notes are vague or missing key details, ask ONE specific follow-up question in place of the heads-up line.
- If NOTHING was extracted: acknowledge the note briefly, say you didn't spot anything to update, and tell them what kinds of details you look for (vendor names, dates, costs, decisions, risks).
- The pending updates appear in the Review panel. Never say "on the right" — on small screens the panel is not on the right.

Extraction rules:
1. Only extract facts actually stated — never invent or assume details.
2. If information is incomplete or ambiguous, create an open_question instead of guessing.
3. One message can produce several items, but only when they are distinct real-world plan changes.
4. Dates and times: use ISO 8601 format. Use YYYY-MM-DD for date-only facts and YYYY-MM-DDTHH:mm:ss for time-specific facts when the date is known. Return null only if no date can be inferred.
5. confidence: 0.0–1.0 representing how certain you are about this extraction.
6. rationale: one short phrase explaining why you extracted this item.
7. All status fields must exactly match the allowed enum values.
8. CRITICAL — no placeholder values: if a vendor name is unknown, create an open_question asking for it. Never put "<UNKNOWN>", "TBD", "Unknown", "N/A", or any placeholder in an extracted field. Unknown fields must be null or omitted.
9. CRITICAL — use conversation history: if earlier messages show you asked a follow-up question and the user is now answering it, extract the complete combined information now. Connect the dots across turns.
10. CRITICAL — do not create duplicate suggestions for the same real-world item in one message.
11. Prefer one consolidated suggestion over multiple overlapping suggestions for the same real-world item. This does not mean collapsing unrelated vendor, task, timeline, budget, decision, risk, or open-question items into one suggestion.
11a. Timeline duplicate guard: if one actor/event/time window is described more than once, create one clearer timeline item rather than near-duplicates. Example: "IBM volunteers arrive 5:00–5:15 PM" and "IBM volunteers arrive closer to 5:00 PM for setup" should become one volunteer-arrival timing unless they are truly separate events.
12. For vendors, create one vendor suggestion per vendor per message.
13. For budget, create one budget item per real cost, budget cap, target, receipt, quote, deposit, or paid charge. A stated cap or target such as "$6,000 max" or "budget target is $2,500" is a budget item even if no vendor has been chosen.
14. For tasks, create only tasks that require a human action. Do not create tasks that merely restate facts.
15. For risks, create a risk only when there is an actual execution concern.
16. If missing information blocks action or leaves an operational logistics question unresolved, ask one open question instead of guessing. Open questions are appropriate for unresolved logistics even if they are not catastrophic blockers. They must come from the note's real-world unknowns — never from your own need for more detail from the user.
17. If previous conversation context indicates the user is clarifying an existing item, update that concept once instead of creating duplicates.
18. Current message takes precedence over older context. Do not introduce unrelated prior vendors, costs, tasks, or risks unless the user's current message is clearly answering or clarifying that same item.
19. If the current message corrects a previous value ("not $2,087", "the total is $1,006.87"), use the corrected value exactly and do not repeat the older value.
20. If several schedule facts are stated in a correction, extract each distinct operational timing when useful, not just the changed one.
21. understood_summary and recommended_summary must summarize this review only. Do not include unrelated open work from earlier messages just because it is still in the event history.`

// ─── Tool schema ──────────────────────────────────────────────────────────────

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
            owner_name:  { type: ['string', 'null'], description: 'Name of the person responsible, if mentioned' },
            confidence:  { type: 'number', minimum: 0, maximum: 1 },
            rationale:   { type: 'string' },
          },
          required: ['title', 'description', 'due_date', 'priority', 'owner_name', 'confidence', 'rationale'],
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
            confidence:     { type: 'number', minimum: 0, maximum: 1 },
            rationale:      { type: 'string' },
          },
          required: ['name', 'category', 'contact_name', 'email', 'phone', 'status', 'estimated_cost', 'notes', 'confidence', 'rationale'],
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
            confidence:     { type: 'number', minimum: 0, maximum: 1 },
            rationale:      { type: 'string' },
          },
          required: ['category', 'description', 'estimated_cost', 'actual_cost', 'status', 'vendor_name', 'confidence', 'rationale'],
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
            confidence:  { type: 'number', minimum: 0, maximum: 1 },
            rationale:   { type: 'string' },
          },
          required: ['title', 'description', 'starts_at', 'ends_at', 'type', 'confidence', 'rationale'],
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
          },
          required: ['title', 'description', 'status', 'decision', 'confidence', 'rationale'],
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
          },
          required: ['title', 'description', 'severity', 'status', 'mitigation', 'confidence', 'rationale'],
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
          },
          required: ['question', 'owner_name', 'confidence', 'rationale'],
        },
      },
    },
    required: ['response_message', 'understood_summary', 'recommended_summary', 'tasks', 'vendors', 'budget_items', 'timeline_items', 'decisions', 'risks', 'open_questions'],
  },
}

// ─── Event state context → prompt section ────────────────────────────────────

function buildEventStateSection(ctx: EventStateContext): string {
  const lines: string[] = ['', '---', '', '## Current Event State', '']

  lines.push(`Event: ${ctx.event.name}`)
  if (ctx.event.event_type) lines.push(`Type: ${ctx.event.event_type}`)
  if (ctx.event.event_date) lines.push(`Date: ${ctx.event.event_date}`)
  if (ctx.event.location) lines.push(`Location: ${ctx.event.location}`)
  if (ctx.event.attendee_target !== null)
    lines.push(`Attendee target: ${ctx.event.attendee_target}`)
  if (ctx.event.budget_target !== null)
    lines.push(`Budget target: $${ctx.event.budget_target}`)

  if (ctx.existing_tasks.length > 0) {
    lines.push('', '### Existing tasks (open/in-progress):')
    for (const t of ctx.existing_tasks) {
      const snippet = t.description ? ` — ${t.description.slice(0, 60)}` : ''
      lines.push(`- [${t.status}, ${t.priority}] ${t.title}${snippet}`)
    }
  }

  if (ctx.existing_vendors.length > 0) {
    lines.push('', '### Existing vendors:')
    for (const v of ctx.existing_vendors) {
      const cost = v.estimated_cost !== null ? ` ($${v.estimated_cost})` : ''
      const contact = v.contact_name ? `, contact: ${v.contact_name}` : ''
      const notes = v.notes ? ` — ${v.notes.slice(0, 60)}` : ''
      lines.push(
        `- ${v.name} [${v.category ?? 'uncategorized'}, ${v.status}${cost}${contact}]${notes}`,
      )
    }
  }

  if (ctx.existing_budget_items.length > 0) {
    lines.push('', '### Existing budget items:')
    for (const b of ctx.existing_budget_items) {
      const cost = b.estimated_cost !== null ? ` ($${b.estimated_cost})` : ''
      lines.push(`- ${b.description} [${b.category}, ${b.status}${cost}]`)
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
    lines.push('', '### Already queued for review (not yet approved):')
    for (const u of ctx.pending_proposed_updates) {
      lines.push(`- [${u.update_type}] ${u.label}`)
    }
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
    'Do NOT propose items that already exist in the plan or are already queued for review above.',
    'If the user provides new details for an existing item, mention it in your summary only.',
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
  priority: 'low' | 'medium' | 'high'; owner_name: string | null
  confidence: number; rationale: string
}
interface RawVendor {
  name: string; category: string | null; contact_name: string | null
  email: string | null; phone: string | null; status: 'prospect' | 'contacted' | 'confirmed' | 'declined'
  estimated_cost: number | null; notes: string | null
  confidence: number; rationale: string
}
interface RawBudgetItem {
  category: string; description: string; estimated_cost: number | null
  actual_cost: number | null; status: 'estimated' | 'committed' | 'paid'
  vendor_name: string | null; confidence: number; rationale: string
}
interface RawTimelineItem {
  title: string; description: string | null; starts_at: string | null
  ends_at: string | null; type: 'milestone' | 'task' | 'deadline' | 'planning'
  confidence: number; rationale: string
}
interface RawDecision {
  title: string; description: string | null; status: 'pending' | 'decided'
  decision: string | null; confidence: number; rationale: string
}
interface RawRisk {
  title: string; description: string | null; severity: 'low' | 'medium' | 'high'
  status: 'open' | 'monitoring' | 'resolved'; mitigation: string | null
  confidence: number; rationale: string
}
interface RawOpenQuestion {
  question: string; owner_name: string | null; confidence: number; rationale: string
}

interface LLMOutput {
  response_message: string
  understood_summary: string[]
  recommended_summary: string[]
  tasks: RawTask[]
  vendors: RawVendor[]
  budget_items: RawBudgetItem[]
  timeline_items: RawTimelineItem[]
  decisions: RawDecision[]
  risks: RawRisk[]
  open_questions: RawOpenQuestion[]
}

export interface LLMResult {
  items: ExtractedItem[]
  responseMessage: string
  understoodSummary: string[]
  recommendedSummary: string[]
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
): Promise<LLMResult> {
  const isFirstExtraction = !history.some((message) => message.role === 'assistant')
  const reviewReminderRule = isFirstExtraction
    ? '\n\nThis is the user\'s first note for this event. End response_message with one extra line: "Review these in the Review panel — I won\'t touch the plan until you approve them."'
    : '\n\nThe user already knows the review flow. Do NOT add a review-reminder line to response_message.'

  const systemPrompt = (eventStateContext
    ? SYSTEM_PROMPT + buildEventStateSection(eventStateContext)
    : SYSTEM_PROMPT) + reviewReminderRule

  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_EXTRACT_MODEL ?? DEFAULT_EXTRACT_MODEL,
    max_tokens: 4096,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: 'extract_event_updates' },
    system: systemPrompt,
    messages: [
      ...history,
      { role: 'user', content: inputText },
    ],
  })

  const toolBlock = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  if (!toolBlock) {
    return {
      items: [],
      responseMessage: "Got it — I saved your note. I didn't find anything to update in the plan yet.",
      understoodSummary: [],
      recommendedSummary: [],
    }
  }

  const raw = toolBlock.input as LLMOutput
  const items: ExtractedItem[] = []

  for (const t of raw.tasks ?? []) {
    items.push({
      update_type: 'task',
      payload: { title: t.title, description: t.description, due_date: t.due_date, priority: t.priority, status: 'todo', owner_name: t.owner_name },
      confidence: t.confidence,
      rationale: t.rationale,
    })
  }

  for (const v of raw.vendors ?? []) {
    items.push({
      update_type: 'vendor',
      payload: { name: v.name, category: v.category, contact_name: v.contact_name, email: v.email, phone: v.phone, status: v.status, estimated_cost: v.estimated_cost, notes: v.notes },
      confidence: v.confidence,
      rationale: v.rationale,
    })
  }

  for (const b of raw.budget_items ?? []) {
    items.push({
      update_type: 'budget_item',
      payload: { category: b.category, description: b.description, estimated_cost: b.estimated_cost, actual_cost: b.actual_cost, status: b.status, vendor_name: b.vendor_name },
      confidence: b.confidence,
      rationale: b.rationale,
    })
  }

  for (const tl of raw.timeline_items ?? []) {
    items.push({
      update_type: 'timeline_item',
      payload: { title: tl.title, description: tl.description, starts_at: tl.starts_at, ends_at: tl.ends_at, type: tl.type },
      confidence: tl.confidence,
      rationale: tl.rationale,
    })
  }

  for (const d of raw.decisions ?? []) {
    items.push({
      update_type: 'decision',
      payload: { title: d.title, description: d.description, status: d.status, decision: d.decision },
      confidence: d.confidence,
      rationale: d.rationale,
    })
  }

  for (const r of raw.risks ?? []) {
    items.push({
      update_type: 'risk',
      payload: { title: r.title, description: r.description, severity: r.severity, status: r.status, mitigation: r.mitigation },
      confidence: r.confidence,
      rationale: r.rationale,
    })
  }

  for (const q of raw.open_questions ?? []) {
    items.push({
      update_type: 'open_question',
      payload: { question: q.question, status: 'open', owner_name: q.owner_name },
      confidence: q.confidence,
      rationale: q.rationale,
    })
  }

  return {
    items,
    responseMessage: raw.response_message ?? "Got it — I saved your note.",
    understoodSummary: normalizeSummary(raw.understood_summary),
    recommendedSummary: normalizeSummary(raw.recommended_summary),
  }
}
