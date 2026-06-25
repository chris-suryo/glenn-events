import { describe, it, expect } from 'vitest'
import { completePackages } from './complete-packages'
import type { ExtractedItem } from './mock-extract'
import type {
  BudgetItemPayload,
  EventStateContext,
  TimelineItemPayload,
  VendorPayload,
} from '@/lib/types'

function ctx(over: Partial<EventStateContext> = {}): EventStateContext {
  return {
    event: {
      name: 'Garden Wedding',
      event_type: 'wedding',
      event_date: '2026-08-22',
      location: null,
      description: null,
      attendee_target: null,
      budget_target: null,
    },
    existing_tasks: [],
    existing_vendors: [],
    existing_budget_items: [],
    existing_timeline_items: [],
    existing_risks: [],
    existing_open_questions: [],
    pending_proposed_updates: [],
    recent_ai_run_summaries: [],
    ...over,
  }
}

function vendorItem(over: Partial<VendorPayload> & { name: string }): ExtractedItem {
  return {
    update_type: 'vendor',
    payload: {
      name: over.name,
      category: over.category ?? null,
      contact_name: null,
      email: null,
      phone: null,
      status: over.status ?? 'contacted',
      estimated_cost: over.estimated_cost ?? null,
      notes: null,
    },
    confidence: 0.9,
    rationale: 'test',
    operation: 'insert',
  }
}

function budgetItem(over: Partial<BudgetItemPayload>): ExtractedItem {
  return {
    update_type: 'budget_item',
    payload: {
      category: over.category ?? 'Florals',
      description: over.description ?? '',
      estimated_cost: over.estimated_cost ?? null,
      actual_cost: null,
      status: 'estimated',
      vendor_name: over.vendor_name ?? null,
    },
    confidence: 0.9,
    rationale: 'test',
    operation: 'insert',
  }
}

const added = (r: { added: ExtractedItem[] }, type: string) =>
  r.added.filter((it) => it.update_type === type)

describe('completePackages', () => {
  it('synthesizes the missing budget + timeline from a vendor-only extraction', () => {
    const input = 'Petal & Stem can do flowers for $650 and deliver at 5:15 PM.'
    const result = completePackages([vendorItem({ name: 'Petal & Stem', category: 'Florals' })], input, ctx())

    const budgets = added(result, 'budget_item')
    expect(budgets).toHaveLength(1)
    expect(budgets[0].payload as BudgetItemPayload).toMatchObject({
      estimated_cost: 650,
      vendor_name: 'Petal & Stem',
      category: 'Florals',
      status: 'estimated',
    })

    const timelines = added(result, 'timeline_item')
    expect(timelines).toHaveLength(1)
    expect(timelines[0].payload as TimelineItemPayload).toMatchObject({
      title: 'Petal & Stem delivery',
      starts_at: '2026-08-22T17:15:00',
      type: 'milestone',
    })
  })

  it('synthesizes the vendor record when only a budget item committed the name', () => {
    const input = 'Bloom Co will handle flowers for $650.'
    const result = completePackages(
      [budgetItem({ vendor_name: 'Bloom Co', estimated_cost: 650, description: 'Bloom Co — flowers' })],
      input,
      ctx(),
    )

    const vendors = added(result, 'vendor')
    expect(vendors).toHaveLength(1)
    expect(vendors[0].payload as VendorPayload).toMatchObject({
      name: 'Bloom Co',
      status: 'contacted',
      estimated_cost: 650, // single amount in scope flows onto the vendor
    })
    // Budget already covered by the LLM's own item — not duplicated.
    expect(added(result, 'budget_item')).toHaveLength(0)
  })

  it('adds nothing when the package is already complete', () => {
    const input = 'Petal & Stem flowers for $650, deliver at 5:15 PM.'
    const timeline: ExtractedItem = {
      update_type: 'timeline_item',
      payload: { title: 'Petal & Stem delivery', description: null, starts_at: '2026-08-22T17:15:00', ends_at: null, type: 'milestone' },
      confidence: 0.9,
      rationale: 'test',
      operation: 'insert',
    }
    const result = completePackages(
      [
        vendorItem({ name: 'Petal & Stem', category: 'Florals' }),
        budgetItem({ vendor_name: 'Petal & Stem', estimated_cost: 650 }),
        timeline,
      ],
      input,
      ctx(),
    )
    expect(result.added).toHaveLength(0)
  })

  it('does not synthesize a budget when the scope has more than one money amount', () => {
    const input = 'Petal & Stem flowers, somewhere between $650 and $800, deliver at 5:15 PM.'
    const result = completePackages([vendorItem({ name: 'Petal & Stem', category: 'Florals' })], input, ctx())
    expect(added(result, 'budget_item')).toHaveLength(0)
    // The delivery timeline is still unambiguous and gets added.
    expect(added(result, 'timeline_item')).toHaveLength(1)
  })

  it('skips a bare time with no action word (could be a meeting, not a delivery)', () => {
    const input = 'Petal & Stem flowers for $650 — call them back at 3:00 PM.'
    const result = completePackages([vendorItem({ name: 'Petal & Stem', category: 'Florals' })], input, ctx())
    expect(added(result, 'timeline_item')).toHaveLength(0)
    expect(added(result, 'budget_item')).toHaveLength(1)
  })

  it('fires the timeline on a clear time range even without an action word', () => {
    const input = 'Petal & Stem will be on site 6:30–8:30 PM.'
    const result = completePackages([vendorItem({ name: 'Petal & Stem', category: 'Florals' })], input, ctx())
    const timelines = added(result, 'timeline_item')
    expect(timelines).toHaveLength(1)
    expect(timelines[0].payload as TimelineItemPayload).toMatchObject({
      title: 'Petal & Stem coverage',
      starts_at: '2026-08-22T18:30:00',
      ends_at: '2026-08-22T20:30:00',
    })
  })

  it('does not synthesize a vendor already present in event context', () => {
    const input = 'Bloom Co will handle flowers for $650.'
    const result = completePackages(
      [budgetItem({ vendor_name: 'Bloom Co', estimated_cost: 650 })],
      input,
      ctx({
        existing_vendors: [
          { id: 'v1', name: 'Bloom Co', category: 'Florals', status: 'confirmed', estimated_cost: null, contact_name: null, email: null, phone: null, notes: null },
        ],
      }),
    )
    expect(added(result, 'vendor')).toHaveLength(0)
  })

  it('returns nothing when there is no real vendor name to anchor a package', () => {
    const taskItem: ExtractedItem = {
      update_type: 'task',
      payload: { title: 'Send invites', description: null, due_date: null, priority: 'medium', status: 'todo', owner_name: null },
      confidence: 0.9,
      rationale: 'test',
      operation: 'insert',
    }
    const result = completePackages([taskItem], 'Send the invites for $650 by 5:15 PM.', ctx())
    expect(result.added).toHaveLength(0)
    expect(result.notes).toHaveLength(0)
  })

  it('leaves starts_at null and falls back to a description when the event has no date', () => {
    const input = 'Petal & Stem can do flowers for $650 and deliver at 5:15 PM.'
    const result = completePackages(
      [vendorItem({ name: 'Petal & Stem', category: 'Florals' })],
      input,
      ctx({ event: { ...ctx().event, event_date: null } }),
    )
    const timelines = added(result, 'timeline_item')
    expect(timelines).toHaveLength(1)
    const payload = timelines[0].payload as TimelineItemPayload
    expect(payload.starts_at).toBeNull()
    expect(payload.description).toContain('5:15')
  })
})
