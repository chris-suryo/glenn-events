import { describe, it, expect } from 'vitest'
import type { Json, VendorPayload, EventDetailPayload } from '@/lib/types'
import type { ExtractedItem } from './mock-extract'
import {
  findVendorCorrectionTarget,
  applyVendorCorrectionOperations,
  findArchiveTargetByLabel,
  resolveCorrectionTargets,
  buildRelatedCleanupProposals,
  isCancellationTaskCleanup,
} from './run-extraction'

// Minimal shapes matching the internal *CorrectionTarget interfaces (structural).
function vTarget(over: Record<string, unknown> = {}) {
  return { id: 'v1', name: 'Unknown', category: null, status: 'prospect', estimated_cost: null, contact_name: null, email: null, phone: null, notes: null, ...over } as never
}
function bTarget(over: Record<string, unknown> = {}) {
  return { id: 'b1', category: 'Florals', description: 'Ceremony flowers', estimated_cost: 2400, actual_cost: null, status: 'estimated', vendor_id: null, ...over } as never
}

function vendorItem(payloadOver: Partial<VendorPayload>, itemOver: Partial<ExtractedItem> = {}): ExtractedItem {
  return {
    update_type: 'vendor',
    payload: { name: 'Petal & Stem', category: null, contact_name: null, email: null, phone: null, status: 'prospect', estimated_cost: null, notes: null, ...payloadOver },
    confidence: 0.9,
    rationale: 'test',
    ...itemOver,
  }
}

const SNAPSHOT = { event_date: null, attendee_target: 90, budget_target: null, location: null } as unknown as Json

describe('findVendorCorrectionTarget', () => {
  it('matches a real-named candidate to a placeholder vendor by category + cost', () => {
    const target = findVendorCorrectionTarget(
      vendorItem({ name: 'Petal & Stem', category: 'Florals', estimated_cost: 2400 }),
      [vTarget({ id: 'v1', name: 'Unknown', category: 'Florals', estimated_cost: 2400 })],
    )
    expect(target).not.toBeNull()
    expect((target as { id: string }).id).toBe('v1')
  })

  it('returns null when no existing vendor is a placeholder', () => {
    const target = findVendorCorrectionTarget(
      vendorItem({ name: 'Petal & Stem', category: 'Florals', estimated_cost: 2400 }),
      [vTarget({ id: 'v1', name: 'Garden Table', category: 'Florals', estimated_cost: 2400 })],
    )
    expect(target).toBeNull()
  })

  it('returns null when the candidate itself has no real name', () => {
    const target = findVendorCorrectionTarget(
      vendorItem({ name: 'Unknown', category: 'Florals', estimated_cost: 2400 }),
      [vTarget({ id: 'v1', name: 'Unknown', category: 'Florals', estimated_cost: 2400 })],
    )
    expect(target).toBeNull()
  })
})

describe('applyVendorCorrectionOperations', () => {
  it('turns a placeholder match into an update; leaves a new vendor an insert; non-vendor untouched', () => {
    const items: ExtractedItem[] = [
      vendorItem({ name: 'Petal & Stem', category: 'Florals', estimated_cost: 2400 }),
      vendorItem({ name: 'Garden Table', category: 'Catering', estimated_cost: 500 }),
      { update_type: 'task', payload: { title: 'Book DJ', description: null, due_date: null, priority: 'medium', status: 'todo', owner_name: null }, confidence: 0.9, rationale: 't' },
    ]
    const out = applyVendorCorrectionOperations(items, [vTarget({ id: 'v1', name: 'Unknown', category: 'Florals', estimated_cost: 2400 })])
    expect(out[0].operation).toBe('update')
    expect(out[0].target_record_id).toBe('v1')
    expect(out[1].operation).toBe('insert')
    expect(out[1].target_record_id).toBeUndefined()
    expect(out[2].operation).toBe('insert')
  })
})

describe('findArchiveTargetByLabel', () => {
  const archiveVendor = (name: string): ExtractedItem => vendorItem({ name }, { operation: 'archive' })

  it('matches a vendor archive to an existing vendor by name', () => {
    const t = findArchiveTargetByLabel(archiveVendor('Petal & Stem'), [], [vTarget({ id: 'v9', name: 'Petal & Stem' })], [], [])
    expect((t as { id: string } | null)?.id).toBe('v9')
  })

  it('returns null when the archive label matches nothing', () => {
    expect(findArchiveTargetByLabel(archiveVendor('Nonexistent Co'), [], [vTarget({ id: 'v9', name: 'Petal & Stem' })], [], [])).toBeNull()
  })

  it('returns null for a non-archive item', () => {
    expect(findArchiveTargetByLabel(vendorItem({ name: 'Petal & Stem' }), [], [vTarget({ id: 'v9', name: 'Petal & Stem' })], [], [])).toBeNull()
  })
})

describe('resolveCorrectionTargets', () => {
  const call = (items: ExtractedItem[], vendors = [vTarget({ id: 'v9', name: 'Petal & Stem' })]) =>
    resolveCorrectionTargets(items, [], vendors, [], [], 'event-1', SNAPSHOT)

  it('routes event_detail to an update against the event row', () => {
    const item: ExtractedItem = { update_type: 'event_detail', payload: { event_date: null, attendee_target: 110, budget_target: null, location: null } as EventDetailPayload, confidence: 0.9, rationale: 't', operation: 'update' }
    const { kept } = call([item])
    expect(kept[0]).toMatchObject({ operation: 'update', target_record_type: 'event_detail', target_record_id: 'event-1' })
    expect(kept[0].target_snapshot_json).toBe(SNAPSHOT)
  })

  it('drops a task archive (task cleanup is applied as a status update, never an archive)', () => {
    const item: ExtractedItem = { update_type: 'task', payload: { title: 'Old task', description: null, due_date: null, priority: 'low', status: 'todo', owner_name: null }, confidence: 0.9, rationale: 't', operation: 'archive' }
    const { kept, droppedCorrections } = call([item])
    expect(kept).toHaveLength(0)
    expect(droppedCorrections).toHaveLength(1)
  })

  it('keeps a vendor archive whose label resolves to an existing vendor', () => {
    const item = vendorItem({ name: 'Petal & Stem' }, { operation: 'archive' })
    const { kept } = call([item])
    expect(kept[0]).toMatchObject({ operation: 'archive', target_record_type: 'vendor', target_record_id: 'v9' })
  })

  it('drops a vendor archive that resolves to nothing', () => {
    const item = vendorItem({ name: 'Ghost Vendor' }, { operation: 'archive' })
    const { kept, droppedCorrections } = call([item])
    expect(kept).toHaveLength(0)
    expect(droppedCorrections).toHaveLength(1)
  })

  it('falls back to insert for an update whose target id is not found', () => {
    const item = vendorItem({ name: 'New Vendor' }, { operation: 'update', target_record_id: 'missing' })
    const { kept } = call([item], [])
    expect(kept[0]).toMatchObject({ operation: 'insert', target_record_id: null })
  })
})

describe('buildRelatedCleanupProposals', () => {
  it('proposes archiving a budget line tied to an archived vendor by vendor_id', () => {
    const vendorArchive = vTarget({ id: 'v9', name: 'Petal & Stem', category: 'Florals' })
    const cleanup = buildRelatedCleanupProposals(
      [vendorArchive],
      [bTarget({ id: 'b1', description: 'Ceremony flowers', vendor_id: 'v9' })],
      [],
      [],
      [],
    )
    const budgetCleanup = cleanup.find((c) => c.update_type === 'budget_item')
    expect(budgetCleanup).toBeDefined()
    expect(budgetCleanup!.operation).toBe('archive')
    expect(budgetCleanup!.target_record_id).toBe('b1')
  })
})

describe('isCancellationTaskCleanup', () => {
  it('is true for a task update marked done because something was canceled', () => {
    expect(isCancellationTaskCleanup({ update_type: 'task', operation: 'update', payload: { title: 'Call ProSound', description: 'No longer needed because ProSound canceled.', due_date: null, priority: 'medium', status: 'done', owner_name: null } as never, confidence: 0.9, rationale: 't' })).toBe(true)
  })
  it('is false for an ordinary task', () => {
    expect(isCancellationTaskCleanup({ update_type: 'task', operation: 'update', payload: { title: 'Call ProSound', description: 'Done', due_date: null, priority: 'medium', status: 'done', owner_name: null } as never, confidence: 0.9, rationale: 't' })).toBe(false)
  })
})
