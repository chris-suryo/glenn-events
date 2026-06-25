import { describe, it, expect } from 'vitest'
import type { ProposedUpdate, UpdatePayload } from '@/lib/types'
import {
  formatMoney,
  formatDate,
  formatTime,
  formatTimeWindow,
  getUpdateName,
  getUpdateDetail,
  getEventDetailChanges,
  getStructuredFields,
  needsCheck,
  isArchive,
  isEventDetail,
  isCorrection,
  buildReviewPackages,
  groupByComponent,
  OTHER_GROUP_LABEL,
} from './review'

function mkUpdate(over: Partial<ProposedUpdate> = {}): ProposedUpdate {
  return {
    id: 'u1',
    event_id: 'e1',
    ai_run_id: 'r1',
    source_message_id: 'm1',
    update_type: 'task',
    payload_json: {} as UpdatePayload,
    confidence: 0.9,
    status: 'pending',
    operation: 'insert',
    target_record_type: null,
    target_record_id: null,
    target_snapshot_json: null,
    supersedes_proposed_update_id: null,
    rationale: null,
    group_label: null,
    created_at: '2026-06-01T00:00:00Z',
    reviewed_by: null,
    reviewed_at: null,
    ...over,
  }
}

describe('value formatters', () => {
  it('formatMoney', () => {
    expect(formatMoney(2400)).toBe('$2,400')
    expect(formatMoney(0)).toBe('$0')
    expect(formatMoney(null)).toBeNull()
    expect(formatMoney('2400')).toBeNull()
  })

  it('formatTime parses the clock straight off the string (no tz shift)', () => {
    expect(formatTime('2026-06-10T17:00:00')).toBe('5:00 PM')
    expect(formatTime('2026-06-10T09:30:00')).toBe('9:30 AM')
    expect(formatTime(null)).toBeNull()
  })

  it('formatTimeWindow collapses a shared meridiem', () => {
    expect(formatTimeWindow('2026-06-10T18:30:00', '2026-06-10T20:00:00')).toBe('6:30–8:00 PM')
    expect(formatTimeWindow('2026-06-10T11:30:00', '2026-06-10T13:00:00')).toBe('11:30 AM–1:00 PM')
    expect(formatTimeWindow('2026-06-10T17:00:00', null)).toBe('5:00 PM')
  })

  it('formatDate keeps a date-only string on its own calendar day', () => {
    // The exact day must survive regardless of host timezone (no UTC rollback).
    expect(formatDate('2026-08-22')).toBe('Aug 22')
    expect(formatDate('2026-01-01')).toBe('Jan 1')
    expect(formatDate(null)).toBeNull()
  })
})

describe('getUpdateName', () => {
  it('picks the right field per type', () => {
    expect(getUpdateName(mkUpdate({ update_type: 'task', payload_json: { title: 'Book shuttle' } as UpdatePayload }))).toBe('Book shuttle')
    expect(getUpdateName(mkUpdate({ update_type: 'vendor', payload_json: { name: 'Petal & Stem' } as UpdatePayload }))).toBe('Petal & Stem')
    expect(getUpdateName(mkUpdate({ update_type: 'open_question', payload_json: { question: 'Which hotel?' } as UpdatePayload }))).toBe('Which hotel?')
  })

  it('always returns "Event details" for event_detail', () => {
    expect(getUpdateName(mkUpdate({ update_type: 'event_detail', payload_json: {} as UpdatePayload }))).toBe('Event details')
  })

  it('falls back to "Untitled suggestion" for an empty payload', () => {
    expect(getUpdateName(mkUpdate({ payload_json: {} as UpdatePayload }))).toBe('Untitled suggestion')
  })
})

describe('getUpdateDetail', () => {
  it('vendor → status · cost', () => {
    expect(getUpdateDetail(mkUpdate({ update_type: 'vendor', payload_json: { status: 'confirmed', estimated_cost: 2000 } as UpdatePayload }))).toBe('confirmed · $2,000')
  })
  it('budget_item → money', () => {
    expect(getUpdateDetail(mkUpdate({ update_type: 'budget_item', payload_json: { estimated_cost: 2400 } as UpdatePayload }))).toBe('$2,400')
  })
  it('event_detail → "<label> → <after>" joined', () => {
    const u = mkUpdate({
      update_type: 'event_detail',
      payload_json: { event_date: null, attendee_target: 110, budget_target: null, location: null } as UpdatePayload,
      target_snapshot_json: { event_date: null, attendee_target: 90, budget_target: null, location: null },
    })
    expect(getUpdateDetail(u)).toBe('Guest count → 110 guests')
  })
})

describe('getEventDetailChanges', () => {
  it('lists only the changed (non-null) fields with before→after', () => {
    const u = mkUpdate({
      update_type: 'event_detail',
      payload_json: { event_date: null, attendee_target: 110, budget_target: 35000, location: null } as UpdatePayload,
      target_snapshot_json: { event_date: null, attendee_target: 90, budget_target: 30000, location: null },
    })
    const changes = getEventDetailChanges(u)
    expect(changes).toEqual([
      { field: 'attendee_target', label: 'Guest count', before: '90 guests', after: '110 guests' },
      { field: 'budget_target', label: 'Budget target', before: '$30,000', after: '$35,000' },
    ])
  })

  it('shows "Not set" when the before-snapshot is missing', () => {
    const u = mkUpdate({
      update_type: 'event_detail',
      payload_json: { event_date: '2026-08-22', attendee_target: null, budget_target: null, location: null } as UpdatePayload,
      target_snapshot_json: null,
    })
    const changes = getEventDetailChanges(u)
    expect(changes).toHaveLength(1)
    expect(changes[0].field).toBe('event_date')
    expect(changes[0].before).toBe('Not set')
    expect(changes[0].after).toBeTruthy()
  })
})

describe('getStructuredFields', () => {
  it('vendor fields', () => {
    const fields = getStructuredFields(mkUpdate({ update_type: 'vendor', payload_json: { status: 'confirmed', category: 'Florals', estimated_cost: 2000, contact_name: null, email: null, phone: null } as UpdatePayload }))
    expect(fields).toEqual([
      { label: 'Status', value: 'confirmed' },
      { label: 'Category', value: 'Florals' },
      { label: 'Cost', value: '$2,000' },
    ])
  })

  it('event_detail fields render as before → after', () => {
    const u = mkUpdate({
      update_type: 'event_detail',
      payload_json: { event_date: null, attendee_target: 110, budget_target: null, location: null } as UpdatePayload,
      target_snapshot_json: { event_date: null, attendee_target: 90, budget_target: null, location: null },
    })
    expect(getStructuredFields(u)).toEqual([{ label: 'Guest count', value: '90 guests → 110 guests' }])
  })
})

describe('operation predicates', () => {
  it('needsCheck flags null or low confidence', () => {
    expect(needsCheck(mkUpdate({ confidence: 0.9 }))).toBe(false)
    expect(needsCheck(mkUpdate({ confidence: 0.5 }))).toBe(true)
    expect(needsCheck(mkUpdate({ confidence: null }))).toBe(true)
    expect(needsCheck(mkUpdate({ confidence: 0.75 }))).toBe(false)
  })
  it('isArchive / isEventDetail / isCorrection', () => {
    expect(isArchive(mkUpdate({ operation: 'archive' }))).toBe(true)
    expect(isArchive(mkUpdate({ operation: 'insert' }))).toBe(false)
    expect(isEventDetail(mkUpdate({ update_type: 'event_detail' }))).toBe(true)
    expect(isEventDetail(mkUpdate({ update_type: 'vendor' }))).toBe(false)
    expect(isCorrection(mkUpdate({ update_type: 'vendor', operation: 'update' }))).toBe(true)
    expect(isCorrection(mkUpdate({ update_type: 'event_detail', operation: 'update' }))).toBe(false) // event_detail not in CORRECTION_TYPES
  })
})

describe('buildReviewPackages partitioning', () => {
  it('splits a run into safe / needsAnswer / removals / eventDetails', () => {
    const updates: ProposedUpdate[] = [
      mkUpdate({ id: 'a', update_type: 'task', confidence: 0.9, payload_json: { title: 'Safe task' } as UpdatePayload }),
      mkUpdate({ id: 'b', update_type: 'task', confidence: 0.4, payload_json: { title: 'Unsure task' } as UpdatePayload }),
      mkUpdate({ id: 'c', update_type: 'vendor', operation: 'archive', confidence: 0.95, payload_json: { name: 'Dropped vendor' } as UpdatePayload }),
      mkUpdate({ id: 'd', update_type: 'event_detail', confidence: 0.3, payload_json: { event_date: null, attendee_target: 100, budget_target: null, location: null } as UpdatePayload }),
    ]
    const [pkg] = buildReviewPackages(updates, [], [])
    expect(pkg.safe.map((u) => u.id)).toEqual(['a'])
    expect(pkg.needsAnswer.map((u) => u.id)).toEqual(['b'])
    expect(pkg.removals.map((u) => u.id)).toEqual(['c'])
    expect(pkg.eventDetails.map((u) => u.id)).toEqual(['d'])
    expect(pkg.counts).toMatchObject({ ready: 1, questions: 1, removals: 1, eventDetails: 1, total: 4 })
  })

  it('groups by ai_run and sorts newest first', () => {
    const updates: ProposedUpdate[] = [
      mkUpdate({ id: 'old', ai_run_id: 'r-old', created_at: '2026-06-01T00:00:00Z' }),
      mkUpdate({ id: 'new', ai_run_id: 'r-new', created_at: '2026-06-02T00:00:00Z' }),
    ]
    const pkgs = buildReviewPackages(updates, [], [])
    expect(pkgs.map((p) => p.aiRunId)).toEqual(['r-new', 'r-old'])
  })
})

describe('groupByComponent', () => {
  it('returns an empty array for no updates', () => {
    expect(groupByComponent([])).toEqual([])
  })

  it('buckets a single tagged component into one group', () => {
    const updates = [
      mkUpdate({ id: 'a', group_label: 'Cake' }),
      mkUpdate({ id: 'b', group_label: 'Cake' }),
    ]
    const groups = groupByComponent(updates)
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Cake')
    expect(groups[0].updates.map((u) => u.id)).toEqual(['a', 'b'])
  })

  it('groups multiple components and preserves first-seen order', () => {
    const updates = [
      mkUpdate({ id: 'a', group_label: 'DJ' }),
      mkUpdate({ id: 'b', group_label: 'Cake' }),
      mkUpdate({ id: 'c', group_label: 'DJ' }),
      mkUpdate({ id: 'd', group_label: 'Venue' }),
    ]
    const groups = groupByComponent(updates)
    expect(groups.map((g) => g.label)).toEqual(['DJ', 'Cake', 'Venue'])
    expect(groups[0].updates.map((u) => u.id)).toEqual(['a', 'c'])
    expect(groups[1].updates.map((u) => u.id)).toEqual(['b'])
    expect(groups[2].updates.map((u) => u.id)).toEqual(['d'])
  })

  it('collects untagged updates under the General bucket', () => {
    const updates = [
      mkUpdate({ id: 'a', group_label: null }),
      mkUpdate({ id: 'c', group_label: '' }),
      mkUpdate({ id: 'd', group_label: '   ' }),
    ]
    const groups = groupByComponent(updates)
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe(OTHER_GROUP_LABEL)
    expect(groups[0].updates.map((u) => u.id)).toEqual(['a', 'c', 'd'])
  })

  it('trims whitespace around labels and merges matching labels', () => {
    const updates = [
      mkUpdate({ id: 'a', group_label: '  Petal & Stem ' }),
      mkUpdate({ id: 'b', group_label: 'Petal & Stem' }),
    ]
    const groups = groupByComponent(updates)
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Petal & Stem')
    expect(groups[0].updates.map((u) => u.id)).toEqual(['a', 'b'])
  })

  it('keeps tagged and untagged updates in separate buckets, in first-seen order', () => {
    const updates = [
      mkUpdate({ id: 'a', group_label: 'Cake' }),
      mkUpdate({ id: 'b', group_label: null }),
      mkUpdate({ id: 'c', group_label: 'Cake' }),
    ]
    const groups = groupByComponent(updates)
    expect(groups.map((g) => g.label)).toEqual(['Cake', OTHER_GROUP_LABEL])
    expect(groups[0].updates.map((u) => u.id)).toEqual(['a', 'c'])
    expect(groups[1].updates.map((u) => u.id)).toEqual(['b'])
  })
})
