function parseDate(value: string | null): Date | null {
  if (!value) return null
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) {
    const [, year, month, day] = dateOnly
    return new Date(Number(year), Number(month) - 1, Number(day))
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function hasExplicitTime(value: string | null, date: Date | null): boolean {
  if (!value || !date || !value.includes('T')) return false
  return date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0
}

function formatDate(date: Date, includeYear = true): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    ...(includeYear ? { year: 'numeric' as const } : {}),
  })
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
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

function sameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function formatTimeRange(start: Date, end: Date | null): string {
  const startTime = formatTime(start)
  if (!end || end.getTime() === start.getTime()) return startTime

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
  const start = parseDate(startsAt)
  if (!start) return location?.trim() || null

  const end = parseDate(endsAt)
  const startHasTime = hasExplicitTime(startsAt, start)
  const endHasTime = hasExplicitTime(endsAt, end)

  let when: string
  if (startHasTime || endHasTime) {
    when = formatTimeRange(start, end)
  } else if (end && end.getTime() !== start.getTime()) {
    when = `${formatDate(start)}–${formatDate(end, false)}`
  } else {
    when = formatDate(start)
  }

  const place = location?.trim()
  return place ? `${when} · ${place}` : when
}
