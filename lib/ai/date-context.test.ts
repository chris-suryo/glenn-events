import { describe, it, expect } from 'vitest'
import { buildTodayDirective } from './date-context'

describe('buildTodayDirective', () => {
  it('states today as a full weekday + date in the event timezone', () => {
    const d = buildTodayDirective(new Date('2026-06-25T12:00:00Z'), 'America/New_York')
    expect(d).toContain('Today is Thursday, June 25, 2026')
    expect(d).toContain('America/New_York')
  })

  it('uses the event-zone wall-clock, not UTC, across the midnight boundary', () => {
    // 02:00 UTC on Jun 25 is still 22:00 on Jun 24 in New York (EDT, UTC-4).
    const d = buildTodayDirective(new Date('2026-06-25T02:00:00Z'), 'America/New_York')
    expect(d).toContain('Wednesday, June 24, 2026')
  })

  it('reflects a different zone for the same instant', () => {
    // 02:00 UTC on Jun 25 is already 11:00 on Jun 25 in Tokyo (UTC+9).
    const d = buildTodayDirective(new Date('2026-06-25T02:00:00Z'), 'Asia/Tokyo')
    expect(d).toContain('Thursday, June 25, 2026')
  })

  it('instructs resolving to the next future occurrence and never a past year', () => {
    const d = buildTodayDirective(new Date('2026-06-25T12:00:00Z'), 'America/New_York')
    expect(d).toContain('next FUTURE occurrence')
    expect(d).toMatch(/never default to a past year/i)
  })

  it('falls back gracefully on an invalid timezone', () => {
    const d = buildTodayDirective(new Date('2026-06-25T12:00:00Z'), 'Not/AZone')
    // Still produces a directive (host-zone date) rather than throwing.
    expect(d).toContain('Resolve every date against today')
  })
})
