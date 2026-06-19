'use client'

import type { ReactNode } from 'react'
import { CalendarClock } from 'lucide-react'
import type { TimelineItem } from '@/lib/types'
import { parseTimelineDateValue, formatTimeRange, sameCalendarDay, type TimelineDateValue } from '@/lib/timeline-format'

const PX_PER_MIN = 1.2

const TYPE_BLOCK: Record<TimelineItem['type'], string> = {
  deadline:  'border-l-rose-500 bg-rose-50 text-rose-900',
  milestone: 'border-l-indigo-500 bg-indigo-50 text-indigo-900',
  planning:  'border-l-amber-400 bg-amber-50 text-amber-900',
  task:      'border-l-emerald-500 bg-emerald-50 text-emerald-900',
}

interface PositionedBlock {
  item: TimelineItem
  start: number
  end: number
  label: string
  col: number
  cols: number
}

function minutesOf(v: TimelineDateValue): number {
  return v.hour * 60 + v.minute
}

/** Timed items on the event day, laid into side-by-side columns where they overlap. */
function layout(items: TimelineItem[], eventDay: TimelineDateValue): PositionedBlock[] {
  const raw: Omit<PositionedBlock, 'col' | 'cols'>[] = []
  for (const item of items) {
    const start = parseTimelineDateValue(item.starts_at)
    if (!start || !start.hasTime || !sameCalendarDay(start, eventDay)) continue
    const rawEnd = parseTimelineDateValue(item.ends_at)
    const validEnd = rawEnd && rawEnd.hasTime && sameCalendarDay(start, rawEnd) ? rawEnd : null
    const startMin = minutesOf(start)
    let endMin = validEnd ? minutesOf(validEnd) : startMin + 60
    if (endMin <= startMin) endMin = startMin + 30
    raw.push({ item, start: startMin, end: endMin, label: formatTimeRange(start, validEnd) })
  }
  raw.sort((a, b) => a.start - b.start || a.end - b.end)

  // Greedily assign columns within each cluster of transitively-overlapping blocks.
  const out: PositionedBlock[] = []
  let cluster: typeof raw = []
  let clusterEnd = -Infinity
  const flush = () => {
    const colEnds: number[] = []
    const placed = cluster.map((b) => {
      let col = colEnds.findIndex((endMin) => b.start >= endMin)
      if (col === -1) { col = colEnds.length; colEnds.push(b.end) }
      else colEnds[col] = b.end
      return { b, col }
    })
    const cols = colEnds.length
    for (const { b, col } of placed) out.push({ ...b, col, cols })
    cluster = []
    clusterEnd = -Infinity
  }
  for (const b of raw) {
    if (cluster.length && b.start >= clusterEnd) flush()
    cluster.push(b)
    clusterEnd = Math.max(clusterEnd, b.end)
  }
  if (cluster.length) flush()
  return out
}

function overlapNotes(blocks: PositionedBlock[]): string[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start)
  const notes: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].start < sorted[i].end && sorted[i].start < sorted[j].end) {
        notes.push(`${sorted[i].item.title} overlaps ${sorted[j].item.title}`)
      }
    }
  }
  return notes
}

function hourLabel(min: number): string {
  const h = Math.floor(min / 60) % 24
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12} ${period}`
}

interface DayOfGridProps {
  items: TimelineItem[]
  eventDate: string | null
  onPick?: (item: TimelineItem) => void
}

export function DayOfGrid({ items, eventDate, onPick }: DayOfGridProps) {
  const eventDay = parseTimelineDateValue(eventDate)

  if (!eventDay) {
    return <Empty>Set an event date to see the day-of schedule.</Empty>
  }

  const blocks = layout(items, eventDay)
  if (blocks.length === 0) {
    return <Empty>No timed segments for the event day yet. Add start/end times to your run-of-show items and they’ll appear here.</Empty>
  }

  const windowStart = Math.floor(Math.min(...blocks.map((b) => b.start)) / 60) * 60
  let windowEnd = Math.ceil(Math.max(...blocks.map((b) => b.end)) / 60) * 60
  if (windowEnd - windowStart < 120) windowEnd = windowStart + 120
  const height = (windowEnd - windowStart) * PX_PER_MIN

  const hours: number[] = []
  for (let m = windowStart; m <= windowEnd; m += 60) hours.push(m)

  const notes = overlapNotes(blocks).slice(0, 4)
  const dayLabel = eventDay.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex-1 rounded-lg border bg-card shadow-[0px_1px_3px_rgba(0,0,0,0.05)] p-4">
        <h3 className="mb-3 text-sm font-semibold tracking-tight">
          Day of <span className="font-medium text-muted-foreground">· {dayLabel}</span>
        </h3>
        <div className="flex">
          <div className="relative w-12 shrink-0" style={{ height }}>
            {hours.map((m) => (
              <div
                key={m}
                className="absolute left-0 -translate-y-1/2 text-[11px] text-muted-foreground"
                style={{ top: (m - windowStart) * PX_PER_MIN, fontVariantNumeric: 'tabular-nums' }}
              >
                {hourLabel(m)}
              </div>
            ))}
          </div>
          <div className="relative flex-1 border-l" style={{ height }}>
            {hours.map((m) => (
              <div key={m} className="absolute inset-x-0 border-t border-border/60" style={{ top: (m - windowStart) * PX_PER_MIN }} />
            ))}
            {blocks.map((b) => {
              const top = (b.start - windowStart) * PX_PER_MIN
              const h = Math.max((b.end - b.start) * PX_PER_MIN, 22)
              const widthPct = 100 / b.cols
              const leftPct = b.col * widthPct
              return (
                <button
                  key={b.item.id}
                  type="button"
                  onClick={onPick ? () => onPick(b.item) : undefined}
                  className={`absolute overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left shadow-sm transition ${TYPE_BLOCK[b.item.type]} ${onPick ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}`}
                  style={{ top, height: h, left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)` }}
                >
                  <span className="block truncate text-[11px] font-semibold leading-tight">{b.item.title}</span>
                  <span className="block truncate text-[10px] font-medium opacity-80" style={{ fontVariantNumeric: 'tabular-nums' }}>{b.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {notes.length > 0 && (
        <div className="w-full lg:w-56 lg:shrink-0">
          <div className="rounded-lg border bg-card shadow-[0px_1px_3px_rgba(0,0,0,0.05)] p-3.5">
            <p className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Overlaps to watch</p>
            <ul className="space-y-2.5">
              {notes.map((note, i) => (
                <li key={i} className="flex gap-2 text-xs leading-snug text-muted-foreground">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-14 text-center">
      <CalendarClock className="h-8 w-8 text-muted-foreground/25" />
      <p className="max-w-sm text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
