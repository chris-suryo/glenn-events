'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar, List } from 'lucide-react'
import type { TimelineItem } from '@/lib/types'

interface TimelineCalendarProps {
  items: TimelineItem[]
  eventId: string
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const TYPE_COLORS: Record<TimelineItem['type'], string> = {
  deadline:  'bg-rose-500',
  milestone: 'bg-indigo-500',
  planning:  'bg-amber-400',
  task:      'bg-emerald-500',
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function parseDate(s: string | null): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

export function TimelineCalendar({ items }: TimelineCalendarProps) {
  const [view, setView] = useState<'list' | 'calendar'>('list')

  // Default to month of nearest future item, or current month
  const firstFutureDate = items
    .map((i) => parseDate(i.starts_at))
    .filter((d): d is Date => d !== null && d >= new Date())
    .sort((a, b) => a.getTime() - b.getTime())[0]

  const today = new Date()
  const initDate = firstFutureDate ?? today
  const [year, setYear] = useState(initDate.getFullYear())
  const [month, setMonth] = useState(initDate.getMonth())

  // Group items by their starts_at date string (YYYY-MM-DD)
  const byDate = new Map<string, TimelineItem[]>()
  for (const item of items) {
    const d = parseDate(item.starts_at)
    if (!d) continue
    const key = isoDate(d)
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(item)
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const numDays = daysInMonth(year, month)
  const firstDow = new Date(year, month, 1).getDay() // 0=Sun
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: numDays }, (_, i) => i + 1),
  ]
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  const TYPE_LABEL: Record<TimelineItem['type'], string> = {
    deadline: 'Deadline', milestone: 'Milestone', planning: 'Planning', task: 'Task',
  }

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1 text-xs w-fit">
        <button
          onClick={() => setView('list')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${view === 'list' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <List className="h-3 w-3" /> List
        </button>
        <button
          onClick={() => setView('calendar')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${view === 'calendar' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Calendar className="h-3 w-3" /> Calendar
        </button>
      </div>

      {view === 'calendar' && (
        <div className="rounded-lg border bg-card shadow-[0px_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
          {/* Month navigation */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <button onClick={prevMonth} className="rounded-md p-1 hover:bg-muted transition-colors" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold tracking-tight">{MONTHS[month]} {year}</p>
            <button onClick={nextMonth} className="rounded-md p-1 hover:bg-muted transition-colors" aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b">
            {DAY_LABELS.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const isToday = day !== null && isoDate(new Date(year, month, day)) === isoDate(today)
              const dateKey = day !== null ? `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}` : ''
              const dayItems = day !== null ? (byDate.get(dateKey) ?? []) : []
              const isLastRow = i >= cells.length - 7

              return (
                <div
                  key={i}
                  className={`min-h-[72px] p-1.5 border-r border-b last:border-r-0
                    ${isLastRow ? 'border-b-0' : ''}
                    ${day === null ? 'bg-muted/20' : 'bg-background'}
                    ${(i + 1) % 7 === 0 ? 'border-r-0' : ''}`}
                >
                  {day !== null && (
                    <>
                      <p className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full mb-1
                        ${isToday ? 'bg-primary text-primary-foreground' : 'text-foreground/70'}`}>
                        {day}
                      </p>
                      <div className="space-y-0.5">
                        {dayItems.slice(0, 2).map((item) => (
                          <div key={item.id} className="flex items-center gap-1 overflow-hidden">
                            <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${TYPE_COLORS[item.type]}`} />
                            <span className="text-[10px] text-foreground/80 truncate leading-tight">{item.title}</span>
                          </div>
                        ))}
                        {dayItems.length > 2 && (
                          <p className="text-[10px] text-muted-foreground pl-2.5">+{dayItems.length - 2} more</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t bg-muted/20">
            {(Object.entries(TYPE_COLORS) as [TimelineItem['type'], string][]).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${color}`} />
                <span className="text-xs text-muted-foreground">{TYPE_LABEL[type]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
