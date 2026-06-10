import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface EventDateTimeFormatOptions {
  weekday?: boolean
  year?: boolean
}

export function formatEventDateTime(
  dateStr: string | null,
  options: EventDateTimeFormatOptions = {},
): string | null {
  if (!dateStr) return null

  const parts = dateStr.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  )

  if (parts) {
    const [, year, month, day, hour, minute, second = '0'] = parts
    const date = new Date(Number(year), Number(month) - 1, Number(day))
    const hasTime = !!hour && (hour !== '00' || minute !== '00' || second !== '00')
    const dateLabel = date.toLocaleDateString('en-US', {
      ...(options.weekday ? { weekday: 'short' as const } : {}),
      month: 'short',
      day: 'numeric',
      ...(options.year !== false ? { year: 'numeric' as const } : {}),
    })

    if (!hasTime) return dateLabel

    const wallClock = new Date(2000, 0, 1, Number(hour), Number(minute), Number(second))
    const timeLabel = wallClock.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
    return `${dateLabel} at ${timeLabel}`
  }

  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return null

  const dateLabel = date.toLocaleDateString('en-US', {
    ...(options.weekday ? { weekday: 'short' as const } : {}),
    month: 'short',
    day: 'numeric',
    ...(options.year !== false ? { year: 'numeric' as const } : {}),
  })

  if (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0
  ) {
    return dateLabel
  }

  return `${dateLabel} at ${date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })}`
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
