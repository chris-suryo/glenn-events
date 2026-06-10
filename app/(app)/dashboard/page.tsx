import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, CalendarDays, MapPin, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Event } from '@/lib/types'

function statusPill(status: Event['status']) {
  switch (status) {
    case 'active': return 'bg-emerald-50 text-emerald-700'
    case 'planning': return 'bg-sky-50 text-sky-700'
    case 'completed': return 'bg-slate-100 text-slate-600'
    case 'archived': return 'bg-slate-100 text-slate-400'
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: events } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false })

  const eventList = (events ?? []) as Event[]

  return (
    <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Your events</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {eventList.length === 0
              ? 'No events yet — create your first one.'
              : `${eventList.length} event${eventList.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link href="/events/new" className={cn(buttonVariants(), 'inline-flex items-center')}>
          <Plus className="h-4 w-4 mr-1.5" />
          New event
        </Link>
      </div>

      {eventList.length === 0 ? (
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-6 shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
            <p className="text-sm font-semibold mb-4">How Glenn works</p>
            <ol className="space-y-4">
              {([
                {
                  n: '1',
                  title: 'Create an event workspace',
                  body: 'Name your event and add what you know — date, location, budget. You can fill in details later.',
                },
                {
                  n: '2',
                  title: 'Tell Glenn what changed',
                  body: 'Paste messy notes, emails, or planning updates. No formatting needed. Glenn reads it and extracts what matters.',
                },
                {
                  n: '3',
                  title: 'Review Glenn\'s suggestions',
                  body: 'Glenn proposes structured updates — tasks, vendors, budget items, risks, and more. You decide what goes into the plan.',
                },
              ] as const).map(({ n, title, body }) => (
                <li key={n} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {n}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border-2 border-dashed border-border py-12 flex flex-col items-center gap-4 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium text-foreground">No events yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create your first event to get started.
              </p>
            </div>
            <Link href="/events/new" className={cn(buttonVariants({ variant: 'outline' }), 'inline-flex items-center')}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create event
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {eventList.map((event) => (
            <Link key={event.id} href={`/events/${event.id}`} className="block group">
              <Card className="h-full border hover:border-primary/30 hover:shadow-[0px_0px_0px_1px_rgba(0,0,0,0.06),0px_4px_12px_rgba(0,0,0,0.08)] transition-all duration-200 shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold leading-snug tracking-tight group-hover:text-primary transition-colors">
                      {event.name}
                    </CardTitle>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize shrink-0 ${statusPill(event.status)}`}>
                      {event.status}
                    </span>
                  </div>
                  {event.description && (
                    <CardDescription className="line-clamp-2 text-xs mt-1">
                      {event.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-0 space-y-1.5">
                  {event.event_date && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                      {new Date(event.event_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                  )}
                  {event.location && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {event.location}
                    </div>
                  )}
                  {event.attendee_target && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      {event.attendee_target} attendees
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
