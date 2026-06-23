import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface EventDateTimeFormatOptions {
  weekday?: boolean
  year?: boolean
}

// Event times are stored as timestamptz (a UTC instant); the original wall-clock
// offset is not preserved. To render the event's *local* time we format the instant
// in the event's timezone. Falls back to this default when an event has no timezone
// set yet (e.g. before migration 015 / for older rows).
export const DEFAULT_EVENT_TZ = 'America/New_York'

export function formatEventDateTime(
  dateStr: string | null,
  options: EventDateTimeFormatOptions = {},
  timeZone: string = DEFAULT_EVENT_TZ,
): string | null {
  if (!dateStr) return null

  const dateLabelOpts = {
    ...(options.weekday ? { weekday: 'short' as const } : {}),
    month: 'short' as const,
    day: 'numeric' as const,
    ...(options.year !== false ? { year: 'numeric' as const } : {}),
  }

  // Date-only values are calendar dates, not instants — never timezone-shift them
  // (that could roll back a day). Build from local components.
  const dateOnly = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) {
    const [, y, m, d] = dateOnly
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-US', dateLabelOpts)
  }

  const instant = new Date(dateStr)
  if (Number.isNaN(instant.getTime())) return null

  const dateLabel = instant.toLocaleDateString('en-US', { timeZone, ...dateLabelOpts })

  const hm = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, hour: '2-digit', minute: '2-digit' })
    .formatToParts(instant)
  const hh = hm.find((p) => p.type === 'hour')?.value
  const mm = hm.find((p) => p.type === 'minute')?.value
  if ((hh === '00' || hh === '24') && mm === '00') return dateLabel

  const timeLabel = instant.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
  return `${dateLabel} at ${timeLabel}`
}

export function formatDistanceToNow(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
