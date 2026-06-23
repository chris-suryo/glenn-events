import { DEFAULT_EVENT_TZ } from './utils'

export interface TimelineDateValue {
  date: Date
  hasTime: boolean
  hour: number
  minute: number
  second: number
}

// `value` is a timestamptz (UTC instant) or a date-only string. Time-bearing values
// are resolved to the event's local wall-clock in `timeZone` — Postgres does not
// preserve the original offset, so we must convert the instant ourselves.
export function parseTimelineDateValue(
  value: string | null,
  timeZone: string = DEFAULT_EVENT_TZ,
): TimelineDateValue | null {
  if (!value) return null

  // Date-only: a plain calendar date — never timezone-shift it.
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) {
    const [, year, month, day] = dateOnly
    return {
      date:    new Date(Number(year), Number(month) - 1, Number(day)),
      hasTime: false,
      hour:    0,
      minute:  0,
      second:  0,
    }
  }

  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year:   'numeric',
    month:  '2-digit',
    day:    '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const part = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value ?? '0')

  let hour = part('hour')
  if (hour === 24) hour = 0 // Intl can emit '24' for midnight in hour12:false
  const minute = part('minute')
  const second = part('second')

  return {
    date:    new Date(part('year'), part('month') - 1, part('day')),
    hasTime: hour !== 0 || minute !== 0 || second !== 0,
    hour,
    minute,
    second,
  }
}

function formatDate(value: TimelineDateValue, includeYear = true): string {
  return value.date.toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    ...(includeYear ? { year: 'numeric' as const } : {}),
  })
}

function formatTime(value: TimelineDateValue): string {
  const wallClock = new Date(2000, 0, 1, value.hour, value.minute, value.second)
  return wallClock.toLocaleTimeString('en-US', {
    hour:   'numeric',
    minute: '2-digit',
  })
}

function period(value: string): string | null {
  return value.match(/\s(AM|PM)$/)?.[1] ?? null
}

function withoutPeriod(value: string): string {
  return value.replace(/\s(AM|PM)$/, '')
}

export function sameCalendarDay(a: TimelineDateValue, b: TimelineDateValue): boolean {
  return a.date.getFullYear() === b.date.getFullYear() &&
    a.date.getMonth() === b.date.getMonth() &&
    a.date.getDate() === b.date.getDate()
}

export function formatTimeRange(start: TimelineDateValue, end: TimelineDateValue | null): string {
  const startTime = formatTime(start)
  if (
    !end ||
    (
      sameCalendarDay(start, end) &&
      start.hour === end.hour &&
      start.minute === end.minute &&
      start.second === end.second
    )
  ) {
    return startTime
  }

  const endTime = formatTime(end)
  if (sameCalendarDay(start, end) && period(startTime) === period(endTime)) {
    return `${withoutPeriod(startTime)}–${endTime}`
  }
  return `${startTime}–${endTime}`
}

export function formatTimelineDateTime(
  startsAt: string | null,
  endsAt: string | null,
  location?: string | null,
  timeZone: string = DEFAULT_EVENT_TZ,
): string | null {
  const start = parseTimelineDateValue(startsAt, timeZone)
  if (!start) return location?.trim() || null

  const end = parseTimelineDateValue(endsAt, timeZone)

  let when: string
  if (start.hasTime || end?.hasTime) {
    when = formatTimeRange(start, end)
  } else if (
    end &&
    (
      !sameCalendarDay(start, end) ||
      start.hour !== end.hour ||
      start.minute !== end.minute ||
      start.second !== end.second
    )
  ) {
    when = `${formatDate(start)}–${formatDate(end, false)}`
  } else {
    when = formatDate(start)
  }

  const place = location?.trim()
  return place ? `${when} · ${place}` : when
}
