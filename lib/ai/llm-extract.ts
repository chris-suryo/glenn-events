import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedItem } from './mock-extract'

const anthropic = new Anthropic()

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Glenn, an event operations coordinator AI. Your job is to read messy planning notes, emails, Slack messages, or verbal updates about an event, and extract every actionable or noteworthy item into a structured event plan.

Extract items into these 7 categories:
- task: action items someone needs to do
- vendor: external service providers (venue, catering, AV, photography, etc.)
- budget_item: cost estimates, quotes, actuals, deposits
- timeline_item: dates, deadlines, scheduling milestones
- decision: choices that need to be made or have been made
- risk: things that could hurt execution
- open_question: questions that need an answer before the plan is complete

Rules:
1. Only extract facts that are actually stated in the input — never invent details
2. If information is incomplete or ambiguous, create an open_question instead of guessing
3. A single input sentence can produce multiple items (e.g., a catering note can produce a budget_item, a task, and a risk)
4. Use ISO 8601 format for dates (YYYY-MM-DD). If you cannot determine a specific date, return null
5. confidence is a float 0.0–1.0 representing how certain you are about this extraction
6. rationale is a short explanation of why you extracted this item
7. All status fields must exactly match the allowed enum values for their type`

// ─── Tool schema ──────────────────────────────────────────────────────────────

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'extract_event_updates',
  description: 'Extract structured event planning updates from messy planning notes. Returns categorized lists of tasks, vendors, budget items, timeline items, decisions, risks, and open questions.',
  input_schema: {
    type: 'object' as const,
    properties: {
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
    required: ['tasks', 'vendors', 'budget_items', 'timeline_items', 'decisions', 'risks', 'open_questions'],
  },
}

// ─── Type for raw tool output ─────────────────────────────────────────────────

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
  tasks: RawTask[]
  vendors: RawVendor[]
  budget_items: RawBudgetItem[]
  timeline_items: RawTimelineItem[]
  decisions: RawDecision[]
  risks: RawRisk[]
  open_questions: RawOpenQuestion[]
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function llmExtract(inputText: string): Promise<ExtractedItem[]> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: 'extract_event_updates' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: inputText }],
  })

  const toolBlock = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  if (!toolBlock) return []

  const raw = toolBlock.input as LLMOutput
  const items: ExtractedItem[] = []

  for (const t of raw.tasks ?? []) {
    items.push({
      update_type: 'task',
      payload: {
        title: t.title,
        description: t.description,
        due_date: t.due_date,
        priority: t.priority,
        status: 'todo',
        owner_name: t.owner_name,
      },
      confidence: t.confidence,
      rationale: t.rationale,
    })
  }

  for (const v of raw.vendors ?? []) {
    items.push({
      update_type: 'vendor',
      payload: {
        name: v.name,
        category: v.category,
        contact_name: v.contact_name,
        email: v.email,
        phone: v.phone,
        status: v.status,
        estimated_cost: v.estimated_cost,
        notes: v.notes,
      },
      confidence: v.confidence,
      rationale: v.rationale,
    })
  }

  for (const b of raw.budget_items ?? []) {
    items.push({
      update_type: 'budget_item',
      payload: {
        category: b.category,
        description: b.description,
        estimated_cost: b.estimated_cost,
        actual_cost: b.actual_cost,
        status: b.status,
        vendor_name: b.vendor_name,
      },
      confidence: b.confidence,
      rationale: b.rationale,
    })
  }

  for (const tl of raw.timeline_items ?? []) {
    items.push({
      update_type: 'timeline_item',
      payload: {
        title: tl.title,
        description: tl.description,
        starts_at: tl.starts_at,
        ends_at: tl.ends_at,
        type: tl.type,
      },
      confidence: tl.confidence,
      rationale: tl.rationale,
    })
  }

  for (const d of raw.decisions ?? []) {
    items.push({
      update_type: 'decision',
      payload: {
        title: d.title,
        description: d.description,
        status: d.status,
        decision: d.decision,
      },
      confidence: d.confidence,
      rationale: d.rationale,
    })
  }

  for (const r of raw.risks ?? []) {
    items.push({
      update_type: 'risk',
      payload: {
        title: r.title,
        description: r.description,
        severity: r.severity,
        status: r.status,
        mitigation: r.mitigation,
      },
      confidence: r.confidence,
      rationale: r.rationale,
    })
  }

  for (const q of raw.open_questions ?? []) {
    items.push({
      update_type: 'open_question',
      payload: {
        question: q.question,
        status: 'open',
        owner_name: q.owner_name,
      },
      confidence: q.confidence,
      rationale: q.rationale,
    })
  }

  return items
}
