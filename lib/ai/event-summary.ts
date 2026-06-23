import Anthropic from '@anthropic-ai/sdk'

const SUMMARY_MODEL = 'claude-haiku-4-5'

export interface SummaryInput {
  name: string
  eventType: string | null
  eventDate: string | null
  location: string | null
  attendeeTarget: number | null
  budgetEstimated: number
  budgetTarget: number | null
  unpricedCount: number
  vendors: Array<{ name: string; status: string; cost: number | null }>
  openTasks: Array<{ title: string; priority: string; due: string | null }>
  openRisks: Array<{ title: string; severity: string }>
  openQuestions: string[]
  pendingDecisions: string[]
  nextItems: Array<{ title: string; startsAt: string | null }>
}

const SYSTEM_PROMPT = `You are Glenn, a calm, experienced event operations coordinator briefing the planner on one event.

Write a SHORT situation brief — one tight paragraph, 2 to 4 sentences, plain prose. No markdown, no bullet points, no headers, no preamble like "Here's" or "Sure".

Cover, in order:
1. What the event is (type, who it's for if known, size, where, when) — one sentence.
2. How it's tracking right now — vendors, budget vs target, what's confirmed.
3. The single most important thing that needs attention or a decision next.

Be specific using the facts given. Never invent facts not provided. Keep it factual and operational, like a trusted colleague giving a 10-second read. Do not editorialize or use exclamation marks.`

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function buildContext(input: SummaryInput): string {
  const lines: string[] = []
  lines.push(`Event name: ${input.name}`)
  if (input.eventType) lines.push(`Type: ${input.eventType}`)
  const when = fmtDate(input.eventDate)
  if (when) lines.push(`Date: ${when}`)
  if (input.location) lines.push(`Location: ${input.location}`)
  if (input.attendeeTarget) lines.push(`Guests: ${input.attendeeTarget}`)

  const budgetLine = input.budgetTarget !== null
    ? `${fmtMoney(input.budgetEstimated)} estimated of ${fmtMoney(input.budgetTarget)} target`
    : input.budgetEstimated > 0
      ? `${fmtMoney(input.budgetEstimated)} estimated (no target set)`
      : 'no budget figures yet'
  lines.push(`Budget: ${budgetLine}${input.unpricedCount > 0 ? `, ${input.unpricedCount} unpriced item(s)` : ''}`)

  if (input.vendors.length > 0) {
    lines.push(`Vendors (${input.vendors.filter((v) => v.status === 'confirmed').length}/${input.vendors.length} confirmed):`)
    for (const v of input.vendors) {
      lines.push(`  - ${v.name} (${v.status}${v.cost !== null ? `, ${fmtMoney(v.cost)}` : ''})`)
    }
  } else {
    lines.push('Vendors: none yet')
  }

  if (input.nextItems.length > 0) {
    lines.push('Upcoming schedule:')
    for (const t of input.nextItems) lines.push(`  - ${t.title}${fmtDate(t.startsAt) ? ` (${fmtDate(t.startsAt)})` : ''}`)
  }
  if (input.openTasks.length > 0) {
    lines.push(`Open tasks (${input.openTasks.length}):`)
    for (const t of input.openTasks.slice(0, 5)) lines.push(`  - ${t.title} (${t.priority}${fmtDate(t.due) ? `, due ${fmtDate(t.due)}` : ''})`)
  }
  if (input.openRisks.length > 0) {
    lines.push(`Open risks (${input.openRisks.length}):`)
    for (const r of input.openRisks) lines.push(`  - ${r.title} (${r.severity})`)
  }
  if (input.pendingDecisions.length > 0) {
    lines.push(`Pending decisions: ${input.pendingDecisions.join('; ')}`)
  }
  if (input.openQuestions.length > 0) {
    lines.push(`Open questions: ${input.openQuestions.join('; ')}`)
  }

  return `Here are the facts for this event. Write Glenn's brief.\n\n${lines.join('\n')}`
}

export async function generateEventSummary(input: SummaryInput): Promise<string> {
  // Instantiate lazily — constructing at module load throws when the API key is
  // absent, which would break the route's no-key deterministic fallback path.
  const anthropic = new Anthropic()
  const message = await anthropic.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 320,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildContext(input) }],
  })
  return message.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim()
}
