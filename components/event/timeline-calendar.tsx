'use client'

import { useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, CalendarClock, List } from 'lucide-react'
import type { TimelineItem } from '@/lib/types'
import { DayOfGrid } from './day-of-grid'
import { RecordDetailDrawer } from './record-detail-drawer'

interface TimelineCalendarProps {
  items: TimelineItem[]
  eventId: string
  /** The event's own date — highlighted on the lead-up calendar. */
  eventDate: string | null
  /** The event's timezone — used to render day-of times in local wall-clock. */
  timeZone?: string
  /** Deep-linked highlight opens the List view so the target row is visible. */
  defaultView?: 'lead-up' | 'list'
  /** The existing vertical list, rendered as the List-view fallback. */
  children: ReactNode
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const TYPE_DOT: Record<TimelineItem['type'], string> = {
  deadline:  'bg-rose-500',
  milestone: 'bg-indigo-500',
  planning:  'bg-amber-400',
  task:      'bg-emerald-500',
}

const TYPE_LABEL: Record<TimelineItem['type'], string> = {
  deadline: 'Deadline', milestone: 'Milestone', planning: 'Planning', task: 'Task',
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

export function TimelineCalendar({ items, eventId, eventDate, timeZone, defaultView = 'lead-up', children }: TimelineCalendarProps) {
  const [view, setView] = useState<'lead-up' | 'day-of' | 'list'>(defaultView)
  const [picked, setPicked] = useState<TimelineItem | null>(null)

  const eventDay = parseDate(eventDate)
  const eventDayKey = eventDay ? isoDate(eventDay) : null

  // Open on the event's month; else the nearest future item; else this month.
  const firstFutureDate = items
    .map((i) => parseDate(i.starts_at))
    .filter((d): d is Date => d !== null && d >= new Date())
    .sort((a, b) => a.getTime() - b.getTime())[0]

  const today = new Date()
  const initDate = eventDay ?? firstFutureDate ?? today
  const [year, setYear] = useState(initDate.getFullYear())
  const [month, setMonth] = useState(initDate.getMonth())

  // Group items by their starts_at date; track undated items so they aren't lost.
  const byDate = new Map<string, TimelineItem[]>()
  let undatedCount = 0
  for (const item of items) {
    const d = parseDate(item.starts_at)
    if (!d) { undatedCount++; continue }
    const key = isoDate(d)
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(item)
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }

  const numDays = daysInMonth(year, month)
  const firstDow = new Date(year, month, 1).getDay()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: numDays }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="space-y-4">
      {/* Mobile: toggle between views. Desktop: all three stack below (no toggle). */}
      <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1 text-xs w-fit lg:hidden">
        <button
          onClick={() => setView('lead-up')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${view === 'lead-up' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <CalendarDays className="h-3 w-3" /> Lead-up
        </button>
        <button
          onClick={() => setView('day-of')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${view === 'day-of' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <CalendarClock className="h-3 w-3" /> Day of
        </button>
        <button
          onClick={() => setView('list')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${view === 'list' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <List className="h-3 w-3" /> List
        </button>
      </div>

      <div className="lg:space-y-6">
        {/* Lead-up */}
        <section className={`${view === 'lead-up' ? '' : 'hidden'} space-y-2 lg:block`}>
          <ViewLabel icon={CalendarDays}>Lead-up</ViewLabel>
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
                const dateKey = day !== null ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : ''
                const isToday = day !== null && dateKey === isoDate(today)
                const isEventDay = dateKey !== '' && dateKey === eventDayKey
                const dayItems = day !== null ? (byDate.get(dateKey) ?? []) : []
                const isLastRow = i >= cells.length - 7

                return (
                  <div
                    key={i}
                    className={`min-h-[76px] p-1.5 border-r border-b last:border-r-0
                      ${isLastRow ? 'border-b-0' : ''}
                      ${isEventDay ? 'bg-violet-50' : day === null ? 'bg-muted/20' : 'bg-background'}
                      ${(i + 1) % 7 === 0 ? 'border-r-0' : ''}`}
                  >
                    {day !== null && (
                      <>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full
                            ${isToday ? 'bg-primary text-primary-foreground' : 'text-foreground/70'}`}>
                            {day}
                          </span>
                          {isEventDay && (
                            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-700">
                              Event
                            </span>
                          )}
                        </div>
                        <div className="space-y-0.5">
                          {dayItems.slice(0, 2).map((item) =>
                            item.type === 'deadline' ? (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setPicked(item)}
                                className="block w-full rounded bg-rose-100 px-1.5 py-0.5 text-left transition-colors hover:bg-rose-200/70"
                              >
                                <span className="block truncate text-[10px] font-medium leading-tight text-rose-700">{item.title}</span>
                              </button>
                            ) : (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setPicked(item)}
                                className="flex w-full items-center gap-1 overflow-hidden rounded text-left transition-colors hover:bg-muted/60"
                              >
                                <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${TYPE_DOT[item.type]}`} />
                                <span className="text-[10px] text-foreground/80 truncate leading-tight">{item.title}</span>
                              </button>
                            )
                          )}
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
            <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 border-t bg-muted/20">
              {(Object.entries(TYPE_DOT) as [TimelineItem['type'], string][]).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${color}`} />
                  <span className="text-xs text-muted-foreground">{TYPE_LABEL[type]}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-violet-400" />
                <span className="text-xs text-muted-foreground">Event day</span>
              </div>
            </div>
          </div>

          {undatedCount > 0 && (
            <p className="px-1 text-xs text-muted-foreground">
              {undatedCount} item{undatedCount !== 1 ? 's' : ''} without a date — shown in the List view.
            </p>
          )}
        </section>

        {/* Day of */}
        <section className={`${view === 'day-of' ? '' : 'hidden'} space-y-2 lg:block`}>
          <ViewLabel icon={CalendarClock}>Day of</ViewLabel>
          <DayOfGrid items={items} eventDate={eventDate} timeZone={timeZone} onPick={setPicked} />
        </section>

        {/* List */}
        <section className={`${view === 'list' ? '' : 'hidden'} space-y-2 lg:block`}>
          <ViewLabel icon={List}>List</ViewLabel>
          {children}
        </section>
      </div>

      {picked && (
        <RecordDetailDrawer eventId={eventId} item={picked} onClose={() => setPicked(null)} />
      )}
    </div>
  )
}

function ViewLabel({ icon: Icon, children }: { icon: typeof CalendarDays; children: ReactNode }) {
  return (
    <div className="hidden items-center gap-1.5 lg:flex">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
    </div>
  )
}
