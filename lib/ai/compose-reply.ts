import type { UpdateType } from '@/lib/types'
import type { ExtractedItem } from './mock-extract'

// Deterministic Glenn replies for file-upload scenarios. Structure is templated
// (consistent, scannable, never claims an apply); the human bullets come from
// extraction. Renders through GlennMessageContent markdown — section headers are
// bold paragraphs, items are bullet blocks (blank line separates them).
//
// Branch 1 covers the file scenarios only. A later branch generalizes this
// composer to typed-note updates, package completion, and failures.

export interface ReplyItem {
  type: UpdateType
  label: string
}

const TYPE_LABEL: Record<UpdateType, string> = {
  task: 'Task',
  vendor: 'Vendor',
  budget_item: 'Budget',
  timeline_item: 'Timeline',
  decision: 'Decision',
  risk: 'Risk',
  open_question: 'Question',
  event_detail: 'Event detail',
}

export type FileReplyScenario =
  | 'updates'
  | 'no_updates'
  | 'low_confidence'
  | 'failed'

export interface FileReplyInput {
  scenario: FileReplyScenario
  displayName: string
  fileName: string
  ready?: ReplyItem[]
  needsConfirmation?: string[]
  removals?: ReplyItem[]
}

function bulletBlock(lines: string[]): string {
  return lines.map((l) => `- ${l}`).join('\n')
}

export function composeFileReply(input: FileReplyInput): string {
  const { scenario, displayName, fileName } = input
  const ready = input.ready ?? []
  const needsConfirmation = input.needsConfirmation ?? []
  const removals = input.removals ?? []
  const storedLine = `**Stored in Event Library** · ${fileName}`
  const nothingApplied = '_Nothing applied yet._'

  if (scenario === 'failed') {
    return [
      `I added **${displayName}** to the Event Library, but I had trouble reading it.`,
      `It's saved as a source — you can open it directly or try uploading it again.`,
      nothingApplied,
    ].join('\n\n')
  }

  if (scenario === 'low_confidence') {
    return [
      `I added **${displayName}** to the Event Library.`,
      `I couldn't read it confidently, so I kept it as a source for now — nothing to review.`,
    ].join('\n\n')
  }

  if (scenario === 'no_updates') {
    return [
      `I added **${displayName}** to the Event Library.`,
      `I didn't find anything that needs a plan change — it's saved as a source.`,
    ].join('\n\n')
  }

  // scenario === 'updates'
  const total = ready.length + needsConfirmation.length + removals.length
  const countPhrase = total === 1 ? '**1 update**' : `**${total} updates**`
  const blocks: string[] = [
    `Got it — I added **${displayName}** to the Event Library and found ${countPhrase} to review.`,
  ]

  if (ready.length > 0) {
    blocks.push('**Ready to review**')
    blocks.push(bulletBlock(ready.map((r) => `${TYPE_LABEL[r.type]}: ${r.label}`)))
  }

  if (removals.length > 0) {
    blocks.push('**Removals to confirm**')
    blocks.push(bulletBlock(removals.map((r) => `${TYPE_LABEL[r.type]}: ${r.label}`)))
  }

  if (needsConfirmation.length > 0) {
    blocks.push('**Needs your confirmation**')
    blocks.push(bulletBlock(needsConfirmation))
  }

  blocks.push(storedLine)
  blocks.push(nothingApplied)
  return blocks.join('\n\n')
}

// ─── Authoritative proposal digest (typed-note replies) ──────────────────────
//
// The chat reply must describe exactly what Glenn proposed — no more, no less.
// The model's free-text reply can drift from its own structured output (it once
// narrated a task it never emitted — smoke-test D16), so we compose the item
// summary from the ACTUAL emitted items[] instead of trusting its prose.

function proposalItemName(item: ExtractedItem): string {
  const p = item.payload as unknown as Record<string, unknown>
  if (item.update_type === 'event_detail') {
    const parts: string[] = []
    if (p.event_date) parts.push('date')
    if (p.attendee_target != null) parts.push('guest count')
    if (p.budget_target != null) parts.push('budget target')
    if (p.location) parts.push('location')
    return parts.length > 0 ? parts.join(', ') : 'event details'
  }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return (
    str(p.title) ?? str(p.name) ?? str(p.question) ?? str(p.description) ?? str(p.category) ?? 'update'
  )
}

// One truthful bullet per emitted item. Operation-aware (Add / Update / Remove).
export function composeProposalDigest(items: ExtractedItem[]): string {
  if (items.length === 0) return ''
  return items
    .map((item) => {
      const label = TYPE_LABEL[item.update_type]
      const verb =
        item.operation === 'archive'
          ? `Remove ${label.toLowerCase()}`
          : item.operation === 'update'
            ? `Update ${label.toLowerCase()}`
            : label
      return `- ${verb}: ${proposalItemName(item)}`
    })
    .join('\n')
}

// The model sometimes lists the updates itself despite being told not to. Strip
// those bullet/label lines so they don't duplicate (or contradict) the
// authoritative digest; the conversational lead + heads-up survive.
const PROPOSAL_BULLET_RE =
  /^\s*(?:[-*•]\s+|(?:task|vendor|budget|timing|timeline|decision|risk|question|open question|event detail)s?\s*:)/i

export function stripItemBullets(text: string): string {
  return text
    .split('\n')
    .filter((line) => !PROPOSAL_BULLET_RE.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
