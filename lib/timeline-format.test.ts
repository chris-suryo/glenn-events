import { describe, it, expect } from 'vitest'
import {
  parseTimelineDateValue,
  formatTimeRange,
  formatTimelineDateTime,
  sameCalendarDay,
  zonedWallClockToUtc,
} from './timeline-format'

const NY = 'America/New_York'
const LA = 'America/Los_Angeles'

describe('parseTimelineDateValue', () => {
  it('returns null for null/empty/garbage input', () => {
    expect(parseTimelineDateValue(null, NY)).toBeNull()
    expect(parseTimelineDateValue('not-a-date', NY)).toBeNull()
  })

  it('treats a date-only string as a calendar date, never timezone-shifted', () => {
    const v = parseTimelineDateValue('2026-06-10', NY)!
    expect(v).not.toBeNull()
    expect(v.hasTime).toBe(false)
    expect(v.date.getFullYear()).toBe(2026)
    expect(v.date.getMonth()).toBe(5) // June (0-indexed)
    expect(v.date.getDate()).toBe(10)
  })

  it('resolves a UTC instant to the event-local wall clock (NY = EDT in June)', () => {
    // 21:00Z on 2026-06-10 is 17:00 (5 PM) in New York during EDT (UTC-4)
    const v = parseTimelineDateValue('2026-06-10T21:00:00Z', NY)!
    expect(v.hasTime).toBe(true)
    expect(v.hour).toBe(17)
    expect(v.minute).toBe(0)
    expect(v.date.getDate()).toBe(10)
  })

  it('renders the same instant differently per timezone', () => {
    // 21:00Z is 14:00 (2 PM) in Los Angeles during PDT (UTC-7)
    const v = parseTimelineDateValue('2026-06-10T21:00:00Z', LA)!
    expect(v.hour).toBe(14)
    expect(v.date.getDate()).toBe(10)
  })

  it('treats local midnight as untimed (hasTime false), guarding the 24:00 case', () => {
    // 04:00Z on 2026-06-10 is 00:00 (midnight) in New York (EDT)
    const v = parseTimelineDateValue('2026-06-10T04:00:00Z', NY)!
    expect(v.hour).toBe(0)
    expect(v.hasTime).toBe(false)
  })

  it('falls back to the default zone (America/New_York) when none is given', () => {
    const v = parseTimelineDateValue('2026-06-10T21:00:00Z')!
    expect(v.hour).toBe(17)
  })
})

describe('sameCalendarDay', () => {
  it('is true for two values on the same day, false across days', () => {
    const a = parseTimelineDateValue('2026-06-10T18:00:00Z', NY)!
    const b = parseTimelineDateValue('2026-06-10T22:00:00Z', NY)!
    const c = parseTimelineDateValue('2026-06-11T18:00:00Z', NY)!
    expect(sameCalendarDay(a, b)).toBe(true)
    expect(sameCalendarDay(a, c)).toBe(false)
  })
})

describe('formatTimeRange', () => {
  it('shows a single time when there is no end', () => {
    const start = parseTimelineDateValue('2026-06-10T21:00:00Z', NY)!
    expect(formatTimeRange(start, null)).toBe('5:00 PM')
  })

  it('collapses a shared meridiem to one suffix', () => {
    const start = parseTimelineDateValue('2026-06-10T22:30:00Z', NY)! // 6:30 PM
    const end = parseTimelineDateValue('2026-06-11T00:00:00Z', NY)!   // 8:00 PM
    expect(formatTimeRange(start, end)).toBe('6:30–8:00 PM')
  })

  it('keeps both meridiems when they differ', () => {
    const start = parseTimelineDateValue('2026-06-10T15:30:00Z', NY)! // 11:30 AM
    const end = parseTimelineDateValue('2026-06-10T17:00:00Z', NY)!   // 1:00 PM
    expect(formatTimeRange(start, end)).toBe('11:30 AM–1:00 PM')
  })
})

describe('formatTimelineDateTime', () => {
  it('returns the time (in event tz) for a timed item', () => {
    expect(formatTimelineDateTime('2026-06-10T21:00:00Z', null, null, NY)).toBe('5:00 PM')
  })

  it('returns the date for a date-only item', () => {
    expect(formatTimelineDateTime('2026-06-10', null, null, NY)).toBe('Jun 10, 2026')
  })

  it('appends a location when provided', () => {
    expect(formatTimelineDateTime('2026-06-10T21:00:00Z', null, 'Riverside Loft', NY)).toBe(
      '5:00 PM · Riverside Loft',
    )
  })

  it('returns the location alone when there is no parseable date', () => {
    expect(formatTimelineDateTime(null, null, 'Riverside Loft', NY)).toBe('Riverside Loft')
    expect(formatTimelineDateTime(null, null, null, NY)).toBeNull()
  })
})

describe('zonedWallClockToUtc', () => {
  it('interprets a naive wall-clock in the event zone during EDT (DST on)', () => {
    // Noon on Sep 18 in New York is EDT (UTC-4) → 16:00 UTC.
    expect(zonedWallClockToUtc('2026-09-18T12:00:00', NY)).toBe('2026-09-18T16:00:00.000Z')
  })

  it('interprets a naive wall-clock in the event zone during EST (DST off)', () => {
    // Noon on Jan 15 in New York is EST (UTC-5) → 17:00 UTC.
    expect(zonedWallClockToUtc('2026-01-15T12:00:00', NY)).toBe('2026-01-15T17:00:00.000Z')
  })

  it('round-trips back through parseTimelineDateValue to the same wall-clock', () => {
    const utc = zonedWallClockToUtc('2026-09-18T12:00:00', NY)
    const back = parseTimelineDateValue(utc, NY)
    expect(back?.hour).toBe(12)
    expect(back?.minute).toBe(0)
  })

  it('uses a fixed offset for a zone without DST (Phoenix control)', () => {
    // America/Phoenix is UTC-7 year-round — summer and winter resolve identically.
    expect(zonedWallClockToUtc('2026-07-01T12:00:00', 'America/Phoenix')).toBe('2026-07-01T19:00:00.000Z')
    expect(zonedWallClockToUtc('2026-01-01T12:00:00', 'America/Phoenix')).toBe('2026-01-01T19:00:00.000Z')
  })

  it('leaves a date-only calendar value untouched (not an instant)', () => {
    expect(zonedWallClockToUtc('2026-09-18', NY)).toBe('2026-09-18')
  })

  it('returns null for null and passes through unrecognized input', () => {
    expect(zonedWallClockToUtc(null, NY)).toBeNull()
    expect(zonedWallClockToUtc('sometime next week', NY)).toBe('sometime next week')
  })

  it('accepts a space-separated wall-clock too', () => {
    expect(zonedWallClockToUtc('2026-09-18 12:00:00', NY)).toBe('2026-09-18T16:00:00.000Z')
  })
})
