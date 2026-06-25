import { describe, it, expect } from 'vitest'
import type { EventStateContext, VendorPayload } from '@/lib/types'
import type { ExtractedItem } from './mock-extract'
import { dedupeExtractedItems } from './dedupe'

function ctx(over: Partial<EventStateContext> = {}): EventStateContext {
  return {
    event: {
      name: 'Wedding',
      event_type: 'Wedding',
      event_date: null,
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

function vendorItem(name: string, confidence: number, extra: Partial<VendorPayload> = {}): ExtractedItem {
  return {
    update_type: 'vendor',
    payload: { name, category: null, contact_name: null, email: null, phone: null, status: 'prospect', estimated_cost: null, notes: null, ...extra },
    confidence,
    rationale: 'test',
  }
}

describe('dedupeExtractedItems', () => {
  it('keeps distinct vendors', () => {
    const res = dedupeExtractedItems([vendorItem('Petal & Stem', 0.9), vendorItem('Garden Table Catering', 0.9)], ctx())
    expect(res.kept).toHaveLength(2)
    expect(res.deduped_count).toBe(0)
  })

  it('drops a near-duplicate within the same batch, keeping the stronger one', () => {
    const res = dedupeExtractedItems(
      [
        vendorItem('Petal & Stem', 0.9, { estimated_cost: 2400 }),
        vendorItem('Petal & Stem', 0.8),
      ],
      ctx(),
    )
    expect(res.kept).toHaveLength(1)
    expect((res.kept[0].payload as VendorPayload).name).toBe('Petal & Stem')
    expect((res.kept[0].payload as VendorPayload).estimated_cost).toBe(2400)
    expect(res.deduped_count).toBe(1)
  })

  it('drops an item that matches a vendor already in the plan', () => {
    const context = ctx({
      existing_vendors: [
        {
          id: 'v1',
          name: 'Petal & Stem',
          category: 'Florals',
          status: 'confirmed',
          estimated_cost: 2000,
          contact_name: null,
          email: null,
          phone: null,
          notes: null,
        },
      ],
    })
    const res = dedupeExtractedItems([vendorItem('Petal & Stem', 0.9)], context)
    expect(res.kept).toHaveLength(0)
    expect(res.deduped_count).toBe(1)
    expect(res.dropped[0].reason).toMatch(/existing vendor/i)
  })
})
