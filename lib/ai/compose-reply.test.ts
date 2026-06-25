import { describe, it, expect } from 'vitest'
import {
  composeFileReply,
  composeProposalDigest,
  stripItemBullets,
  type FileReplyInput,
} from './compose-reply'
import type { ExtractedItem } from './mock-extract'
import type { UpdatePayload } from '@/lib/types'

function input(over: Partial<FileReplyInput> = {}): FileReplyInput {
  return { scenario: 'updates', displayName: 'Catering quote', fileName: 'catering.pdf', ...over }
}

function item(over: Partial<ExtractedItem> & { update_type: ExtractedItem['update_type'] }): ExtractedItem {
  return {
    payload: {} as UpdatePayload,
    confidence: 0.9,
    rationale: 'test',
    operation: 'insert',
    ...over,
  }
}

describe('composeFileReply', () => {
  it('failed: names the file, says it is saved as a source, applies nothing', () => {
    const reply = composeFileReply(input({ scenario: 'failed' }))
    expect(reply).toContain('**Catering quote**')
    expect(reply).toContain('trouble reading it')
    expect(reply).toContain('_Nothing applied yet._')
  })

  it('low_confidence: keeps it as a source, nothing to review', () => {
    const reply = composeFileReply(input({ scenario: 'low_confidence' }))
    expect(reply).toContain('kept it as a source')
    expect(reply).not.toContain('Ready to review')
  })

  it('no_updates: stored as a source, no plan change', () => {
    const reply = composeFileReply(input({ scenario: 'no_updates' }))
    expect(reply).toContain("didn't find anything that needs a plan change")
  })

  it('updates: singular count phrasing for one item', () => {
    const reply = composeFileReply(input({ ready: [{ type: 'task', label: 'Confirm menu' }] }))
    expect(reply).toContain('**1 update**')
    expect(reply).not.toContain('**1 updates**')
  })

  it('updates: plural count sums ready + needsConfirmation + removals', () => {
    const reply = composeFileReply(
      input({
        ready: [{ type: 'task', label: 'Confirm menu' }],
        needsConfirmation: ['Is the deposit paid?'],
        removals: [{ type: 'vendor', label: 'Old caterer' }],
      }),
    )
    expect(reply).toContain('**3 updates**')
  })

  it('updates: renders each section with type-labelled bullets', () => {
    const reply = composeFileReply(
      input({
        ready: [{ type: 'budget_item', label: 'Catering $4,000' }],
        removals: [{ type: 'vendor', label: 'Old caterer' }],
        needsConfirmation: ['Final headcount?'],
      }),
    )
    expect(reply).toContain('**Ready to review**')
    expect(reply).toContain('- Budget: Catering $4,000')
    expect(reply).toContain('**Removals to confirm**')
    expect(reply).toContain('- Vendor: Old caterer')
    expect(reply).toContain('**Needs your confirmation**')
    expect(reply).toContain('- Final headcount?')
    expect(reply).toContain('**Stored in Event Library** · catering.pdf')
    expect(reply).toContain('_Nothing applied yet._')
  })

  it('updates: omits empty sections', () => {
    const reply = composeFileReply(input({ ready: [{ type: 'task', label: 'Confirm menu' }] }))
    expect(reply).not.toContain('Removals to confirm')
    expect(reply).not.toContain('Needs your confirmation')
  })
})

describe('composeProposalDigest', () => {
  it('returns empty string for no items', () => {
    expect(composeProposalDigest([])).toBe('')
  })

  it('renders one truthful bullet per emitted item, by name', () => {
    const digest = composeProposalDigest([
      item({ update_type: 'vendor', payload: { name: 'Petal & Stem' } as UpdatePayload }),
      item({ update_type: 'budget_item', payload: { description: 'Ceremony florals' } as UpdatePayload }),
      item({ update_type: 'task', payload: { title: 'Send save-the-date' } as UpdatePayload }),
    ])
    expect(digest).toBe('- Vendor: Petal & Stem\n- Budget: Ceremony florals\n- Task: Send save-the-date')
  })

  it('is operation-aware (Add / Update / Remove)', () => {
    const digest = composeProposalDigest([
      item({ update_type: 'vendor', operation: 'archive', payload: { name: 'Lakeside Pavilion' } as UpdatePayload }),
      item({ update_type: 'budget_item', operation: 'update', payload: { description: 'Catering' } as UpdatePayload }),
    ])
    expect(digest).toBe('- Remove vendor: Lakeside Pavilion\n- Update budget: Catering')
  })

  it('summarizes event_detail by the fields it sets', () => {
    const digest = composeProposalDigest([
      item({
        update_type: 'event_detail',
        operation: 'update',
        payload: { event_date: '2026-08-22', attendee_target: 90, budget_target: null, location: null } as UpdatePayload,
      }),
    ])
    expect(digest).toBe('- Update event detail: date, guest count')
  })

  it('only ever lists items that were actually emitted', () => {
    // A reply could claim a task; the digest can't — it is built from items[].
    const digest = composeProposalDigest([item({ update_type: 'decision', payload: { title: 'Kayaking' } as UpdatePayload })])
    expect(digest).toBe('- Decision: Kayaking')
    expect(digest).not.toMatch(/task/i)
  })
})

describe('stripItemBullets', () => {
  it('drops bullet and label lines, keeps the conversational lead + heads-up', () => {
    const text = [
      "Here's what I pulled from that note.",
      '- Vendor: Petal & Stem',
      '- Budget: $2,400',
      'Task: Send save-the-date',
      'Heads up: grandma leaves by 7:30.',
    ].join('\n')
    expect(stripItemBullets(text)).toBe(
      "Here's what I pulled from that note.\nHeads up: grandma leaves by 7:30.",
    )
  })

  it('returns empty when the model wrote only bullets', () => {
    expect(stripItemBullets('- Vendor: X\n- Budget: Y')).toBe('')
  })

  it('leaves bullet-free prose untouched', () => {
    expect(stripItemBullets('I drafted a few suggestions for your review.')).toBe(
      'I drafted a few suggestions for your review.',
    )
  })
})
