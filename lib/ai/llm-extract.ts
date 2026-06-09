import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedItem } from './mock-extract'

const anthropic = new Anthropic()

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

How to write response_message:
PART 1 — Confirm what you understood (1–3 sentences max, only what matters).
PART 2 — What you're recommending to add (short bullets, action-first language):
  • "Add catering to the budget at $12k estimated"
  • "Create a task: Confirm all-in AV cost by end of week"
  • "Flag a risk: AV still unconfirmed 6 weeks out"
PART 3 — One line: "Review the suggestions on the right — I won't touch the plan until you approve them."

Tone rules for response_message:
- Never say "task", "vendor", "budget_item", "timeline_item" as raw nouns. Use action phrases.
- Never say "I extracted N items" or "I found N updates." That's database talk.
- If notes mention something risky or time-sensitive, flag it briefly.
- If notes are vague or missing key details, ask a specific follow-up question in the response.
- If NOTHING was extracted: acknowledge the note briefly, say you didn't spot anything to update, and tell them what kinds of details you look for (vendor names, dates, costs, decisions, risks).

Extraction rules:
1. Only extract facts actually stated — never invent or assume details.
2. If information is incomplete or ambiguous, create an open_question instead of guessing.
3. One message can produce several items, but only when they are distinct real-world plan changes.
4. Dates: ISO 8601 format (YYYY-MM-DD). Return null if no date specified.
5. confidence: 0.0–1.0 representing how certain you are about this extraction.
6. rationale: one short phrase explaining why you extracted this item.
7. All status fields must exactly match the allowed enum values.
8. CRITICAL — no placeholder values: if a vendor name is unknown, create an open_question asking for it. Never put "<UNKNOWN>", "TBD", "Unknown", "N/A", or any placeholder in an extracted field. Unknown fields must be null or omitted.
9. CRITICAL — use conversation history: if earlier messages show you asked a follow-up question and the user is now answering it, extract the complete combined information now. Connect the dots across turns.
10. CRITICAL — do not create duplicate suggestions for the same real-world item in one message.
11. Prefer one consolidated suggestion over multiple overlapping suggestions.
12. For vendors, create one vendor suggestion per vendor per message.
13. For budget, create one budget item per real cost, receipt, quote, deposit, or paid charge.
14. For tasks, create only tasks that require a human action. Do not create tasks that merely restate facts.
15. For risks, create a risk only when there is an actual execution concern.
16. If missing information blocks action, ask one open question instead of creating speculative updates.
17. If previous conversation context indicates the user is clarifying an existing item, update that concept once instead of creating duplicates.
18. Current message takes precedence over older context. Do not introduce unrelated prior vendors, costs, tasks, or risks unless the user's current message is clearly answering or clarifying that same item.
19. If the current message corrects a previous value ("not $2,087", "the total is $1,006.87"), use the corrected value exactly and do not repeat the older value.
20. understood_summary and recommended_summary must summarize this review only. Do not include unrelated open work from earlier messages just because it is still in the event history.`

// ─── Tool schema ──────────────────────────────────────────────────────────────

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'extract_event_updates',
  description: 'Extract structured event planning updates from notes, plus write a conversational Glenn response.',
  input_schema: {
    type: 'object' as const,
    properties: {
      response_message: {
        type: 'string',
        description: 'Glenn\'s natural reply as a seasoned event ops colleague. Three parts: (1) brief confirmation of what you understood — plain English, no padding; (2) short action-first bullets of what you\'re recommending to add ("Add X to budget", "Create task: Y", "Flag risk: Z"); (3) one-liner: "Review the suggestions on the right — I won\'t touch the plan until you approve them." Never use database type names. Never start with "Got it!" or "Sure!". Sound like a real person.',
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
        description: 'Cost estimates, quotes, actuals, deposits',
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
        description: 'Dates, deadlines, scheduling milestones',
        items: {
          type: 'object',
          properties: {
            title:       { type: 'string' },
            description: { type: ['string', 'null'] },
            starts_at:   { type: ['string', 'null'], description: 'ISO 8601 date or null' },
            ends_at:     { type: ['string', 'null'], description: 'ISO 8601 date or null' },
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
        description: 'Questions that need an answer before the plan is complete',
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
): Promise<LLMResult> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: 'extract_event_updates' },
    system: SYSTEM_PROMPT,
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
