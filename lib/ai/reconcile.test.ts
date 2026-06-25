import { describe, it, expect } from 'vitest'
import type { VendorPayload, TaskPayload } from '@/lib/types'
import type { ExtractedItem } from './mock-extract'
import {
  reconcileAgainstPending,
  findSupersededPending,
  classifyPendingMatch,
  type PendingProposalLite,
} from './dedupe'

function vendor(
  name: string,
  confidence: number,
  payloadOver: Partial<VendorPayload> = {},
  itemOver: Partial<ExtractedItem> = {},
): ExtractedItem {
  return {
    update_type: 'vendor',
    payload: { name, category: null, contact_name: null, email: null, phone: null, status: 'prospect', estimated_cost: null, notes: null, ...payloadOver },
    confidence,
    rationale: 'test',
    ...itemOver,
  }
}

function task(title: string, confidence: number, over: Partial<TaskPayload> = {}): ExtractedItem {
  return {
    update_type: 'task',
    payload: { title, description: null, due_date: null, priority: 'medium', status: 'todo', owner_name: null, ...over },
    confidence,
    rationale: 'test',
  }
}

function pendingVendor(
  id: string,
  name: string,
  confidence: number | null,
  payloadOver: Partial<VendorPayload> = {},
  operation: 'insert' | 'update' | 'archive' = 'insert',
): PendingProposalLite {
  return {
    id,
    update_type: 'vendor',
    payload_json: { name, category: null, contact_name: null, email: null, phone: null, status: 'prospect', estimated_cost: null, notes: null, ...payloadOver },
    confidence,
    operation,
  }
}

describe('classifyPendingMatch', () => {
  it('returns none for a different type', () => {
    expect(classifyPendingMatch(task('Book DJ', 0.9), pendingVendor('p1', 'Book DJ', 0.9))).toBe('none')
  })

  it('ready pending: the richer same-label item supersedes', () => {
    const item = vendor('Petal & Stem', 0.9, { estimated_cost: 2400 }) // name + status + cost
    const pending = pendingVendor('p1', 'Petal & Stem', 0.9) // name + status
    expect(classifyPendingMatch(item, pending)).toBe('supersede')
  })

  it('ready pending: a poorer same-label item is a restatement', () => {
    const item = vendor('Petal & Stem', 0.9) // name + status
    const pending = pendingVendor('p1', 'Petal & Stem', 0.9, { estimated_cost: 2400 }) // name + status + cost
    expect(classifyPendingMatch(item, pending)).toBe('poorer_restatement')
  })

  it('needs-check pending: a clarified item supersedes on payload-token overlap', () => {
    const item = task('arrange florist delivery window', 0.9)
    const pending: PendingProposalLite = {
      id: 'p1',
      update_type: 'task',
      payload_json: { title: 'arrange florist delivery', description: null, due_date: null, priority: 'medium', status: 'todo', owner_name: null } as TaskPayload,
      confidence: 0.4, // low → needs-check tier
    }
    expect(classifyPendingMatch(item, pending)).toBe('supersede')
  })
})

describe('findSupersededPending', () => {
  it('returns the ids of pending rows the item supersedes', () => {
    const item = vendor('Petal & Stem', 0.9, { estimated_cost: 2400 })
    const pool = [
      pendingVendor('p1', 'Petal & Stem', 0.9),
      pendingVendor('p2', 'Garden Table Catering', 0.9),
    ]
    expect(findSupersededPending(item, pool)).toEqual(['p1'])
  })

  it('returns [] when nothing matches', () => {
    expect(findSupersededPending(task('Book DJ', 0.9), [pendingVendor('p1', 'Petal & Stem', 0.9)])).toEqual([])
  })
})

describe('reconcileAgainstPending — explicit replaces_queued_id', () => {
  it('claims a valid insert link', () => {
    const item = vendor('Petal & Stem', 0.9, { estimated_cost: 2000 }, { replaces_queued_id: 'p1' })
    const res = reconcileAgainstPending([item], [pendingVendor('p1', 'Petal & Stem', 0.9)])
    expect(res.kept).toHaveLength(1)
    expect(res.kept[0].claimed_pending_ids).toEqual(['p1'])
    expect(res.invalid_replace_ids).toHaveLength(0)
  })

  it('flags a link that is not in the pool (and an unrelated pool stays unclaimed)', () => {
    const item = vendor('Petal & Stem', 0.9, {}, { replaces_queued_id: 'missing' })
    const res = reconcileAgainstPending([item], [pendingVendor('p1', 'Garden Table Catering', 0.9)])
    expect(res.invalid_replace_ids[0]).toMatchObject({ replaces_queued_id: 'missing', reason: 'not found in pending pool' })
    expect(res.kept[0].claimed_pending_ids).toEqual([])
  })

  it('flags a link to a different type', () => {
    const item = vendor('Petal & Stem', 0.9, {}, { replaces_queued_id: 'p1' })
    const pendingTask: PendingProposalLite = { id: 'p1', update_type: 'task', payload_json: { title: 'x' } as TaskPayload, confidence: 0.9, operation: 'insert' }
    const res = reconcileAgainstPending([item], [pendingTask])
    expect(res.invalid_replace_ids[0].reason).toMatch(/type mismatch/)
  })

  it('flags a link to a queued correction/removal (non-insert)', () => {
    const item = vendor('Petal & Stem', 0.9, {}, { replaces_queued_id: 'p1' })
    const res = reconcileAgainstPending([item], [pendingVendor('p1', 'Petal & Stem', 0.9, {}, 'archive')])
    expect(res.invalid_replace_ids[0].reason).toMatch(/queued correction\/removal/)
  })

  it('prevents two items from claiming the same pending row', () => {
    const a = vendor('Petal & Stem', 0.9, {}, { replaces_queued_id: 'p1' })
    const b = vendor('Petal & Stem', 0.9, {}, { replaces_queued_id: 'p1' })
    const res = reconcileAgainstPending([a, b], [pendingVendor('p1', 'Petal & Stem', 0.9)])
    expect(res.kept[0].claimed_pending_ids).toEqual(['p1'])
    expect(res.invalid_replace_ids.some((r) => /already claimed/.test(r.reason))).toBe(true)
  })
})

describe('reconcileAgainstPending — fuzzy + restatement', () => {
  it('drops an insert that only restates a richer ready pending row', () => {
    const item = vendor('Petal & Stem', 0.9) // poorer (name + status)
    const res = reconcileAgainstPending([item], [pendingVendor('p1', 'Petal & Stem', 0.9, { estimated_cost: 2400 })])
    expect(res.kept).toHaveLength(0)
    expect(res.dropped).toHaveLength(1)
    expect(res.dropped[0].reason).toMatch(/less detail/)
  })

  it('never drops a correction/archive, even if poorer', () => {
    const item = vendor('Petal & Stem', 0.9, {}, { operation: 'update' }) // poorer but an update
    const res = reconcileAgainstPending([item], [pendingVendor('p1', 'Petal & Stem', 0.9, { estimated_cost: 2400 })])
    expect(res.kept).toHaveLength(1)
    expect(res.dropped).toHaveLength(0)
  })

  it('claims a poorer pending row when the new item is richer (fuzzy supersede)', () => {
    const item = vendor('Petal & Stem', 0.9, { estimated_cost: 2000 })
    const res = reconcileAgainstPending([item], [pendingVendor('p1', 'Petal & Stem', 0.9)])
    expect(res.kept[0].claimed_pending_ids).toEqual(['p1'])
  })
})
