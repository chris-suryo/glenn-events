import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { TimelineItem } from '@/lib/types'
import { Calendar } from 'lucide-react'
import { AiSourceBadge } from '@/components/event/ai-source-badge'
import { TimelineCalendar } from '@/components/event/timeline-calendar'
import { formatTimelineDateTime } from '@/lib/timeline-format'

interface PageProps {
  params: Promise<{ eventId: string }>
}

export default async function TimelinePage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const [{ data: event }, { data: items }] = await Promise.all([
    supabase.from('events').select('id, name, location').eq('id', eventId).single(),
    supabase.from('timeline_items').select('*').eq('event_id', eventId).order('starts_at', { ascending: true }),
  ])

  if (!event) notFound()

  const list = (items ?? []) as TimelineItem[]

  const TYPE_COLORS: Record<TimelineItem['type'], string> = {
    deadline:  'bg-rose-100 text-rose-700',
    milestone: 'bg-indigo-100 text-indigo-700',
    planning:  'bg-amber-100 text-amber-700',
    task:      'bg-emerald-100 text-emerald-700',
  }

  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Timeline</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{list.length} item{list.length !== 1 ? 's' : ''}</p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-14 flex flex-col items-center gap-3 text-center">
          <Calendar className="h-8 w-8 text-muted-foreground/25" />
          <p className="text-sm text-muted-foreground">No timeline items yet. Tell Glenn about key dates and milestones.</p>
        </div>
      ) : (
        <>
          {/* List/Calendar toggle — client component */}
          <TimelineCalendar items={list} eventId={eventId} />

          {/* List view is rendered server-side here; calendar renders inside TimelineCalendar */}
          <div className="relative space-y-2.5 pl-6" id="timeline-list">
            <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
            {list.map((item) => {
              const timelineWhen = formatTimelineDateTime(item.starts_at, item.ends_at, event.location as string | null)
              return (
                <div key={item.id} className="relative">
                  <div className="absolute -left-4 mt-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                  <div className="rounded-lg border bg-card p-3.5 shadow-[0px_1px_2px_rgba(0,0,0,0.04)]">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium tracking-tight">{item.title}</p>
                        {timelineWhen && (
                          <div className="flex items-center gap-1.5 mt-1 text-xs font-medium text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {timelineWhen}
                          </div>
                        )}
                        {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TYPE_COLORS[item.type]}`}>
                          {item.type}
                        </span>
                      </div>
                    </div>
                    {item.ai_generated && (
                      <div className="mt-1.5">
                        <AiSourceBadge eventId={eventId} sourceMessageId={item.source_message_id} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
