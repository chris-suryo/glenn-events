interface TimelineDateValue {
  date: Date
  hasTime: boolean
  hour: number
  minute: number
  second: number
}

function parseTimelineDateValue(value: string | null): TimelineDateValue | null {
  if (!value) return null
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

  const dateTime = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/,
  )
  if (dateTime) {
    const [, year, month, day, hour, minute, second = '0'] = dateTime
    const h = Number(hour)
    const m = Number(minute)
    const s = Number(second)
    return {
      date:    new Date(Number(year), Number(month) - 1, Number(day)),
      hasTime: h !== 0 || m !== 0 || s !== 0,
      hour:    h,
      minute:  m,
      second:  s,
    }
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return {
    date,
    hasTime: value.includes('T') && (
      date.getHours() !== 0 ||
      date.getMinutes() !== 0 ||
      date.getSeconds() !== 0
    ),
    hour:   date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
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

function sameCalendarDay(a: TimelineDateValue, b: TimelineDateValue): boolean {
  return a.date.getFullYear() === b.date.getFullYear() &&
    a.date.getMonth() === b.date.getMonth() &&
    a.date.getDate() === b.date.getDate()
}

function formatTimeRange(start: TimelineDateValue, end: TimelineDateValue | null): string {
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
): string | null {
  const start = parseTimelineDateValue(startsAt)
  if (!start) return location?.trim() || null

  const end = parseTimelineDateValue(endsAt)

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
