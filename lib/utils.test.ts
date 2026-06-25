import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatEventDateTime, formatDistanceToNow, DEFAULT_EVENT_TZ } from './utils'

const NY = 'America/New_York'

describe('DEFAULT_EVENT_TZ', () => {
  it('is America/New_York', () => {
    expect(DEFAULT_EVENT_TZ).toBe('America/New_York')
  })
})

describe('formatEventDateTime', () => {
  it('returns null for null input', () => {
    expect(formatEventDateTime(null)).toBeNull()
  })

  it('formats a date-only value as a calendar date, never timezone-shifted', () => {
    expect(formatEventDateTime('2026-06-10', {}, NY)).toBe('Jun 10, 2026')
    // A New Year's date must not roll back to Dec 31 of the prior year
    expect(formatEventDateTime('2026-01-01', {}, NY)).toBe('Jan 1, 2026')
  })

  it('honors the year:false option', () => {
    expect(formatEventDateTime('2026-06-10', { year: false }, NY)).toBe('Jun 10')
  })

  it('renders a timed instant in the event timezone with "at"', () => {
    // 21:00Z = 5:00 PM in New York (EDT)
    expect(formatEventDateTime('2026-06-10T21:00:00Z', {}, NY)).toBe('Jun 10, 2026 at 5:00 PM')
  })

  it('drops the time when the local wall-clock is midnight', () => {
    // 04:00Z = 00:00 in New York → date only
    expect(formatEventDateTime('2026-06-10T04:00:00Z', {}, NY)).toBe('Jun 10, 2026')
  })

  it('returns null for an unparseable string', () => {
    expect(formatEventDateTime('nonsense', {}, NY)).toBeNull()
  })
})

describe('formatDistanceToNow', () => {
  afterEach(() => vi.useRealTimers())

  it('reports coarse relative buckets', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-10T12:00:00Z'))
    expect(formatDistanceToNow('2026-06-10T11:59:30Z')).toBe('just now')
    expect(formatDistanceToNow('2026-06-10T11:30:00Z')).toBe('30m ago')
    expect(formatDistanceToNow('2026-06-10T09:00:00Z')).toBe('3h ago')
    expect(formatDistanceToNow('2026-06-07T12:00:00Z')).toBe('3d ago')
  })
})
