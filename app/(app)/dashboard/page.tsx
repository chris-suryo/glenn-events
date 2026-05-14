import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, CalendarDays, MapPin, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Event } from '@/lib/types'

function statusVariant(status: Event['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'active': return 'default'
    case 'draft': return 'secondary'
    case 'completed': return 'outline'
    case 'cancelled': return 'destructive'
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
    <div className="p-6 max-w-5xl mx-auto space-y-6">
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
        <div className="rounded-xl border-2 border-dashed border-border py-16 flex flex-col items-center gap-4 text-center">
          <CalendarDays className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-medium text-foreground">No events yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first event and let Glenn help you stay on top of it.
            </p>
          </div>
          <Link href="/events/new" className={cn(buttonVariants({ variant: 'outline' }), 'inline-flex items-center')}>
            <Plus className="h-4 w-4 mr-1.5" />
            Create event
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {eventList.map((event) => (
            <Link key={event.id} href={`/events/${event.id}`} className="block group">
              <Card className="h-full border hover:border-primary/40 hover:shadow-sm transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold leading-snug group-hover:text-primary transition-colors">
                      {event.name}
                    </CardTitle>
                    <Badge variant={statusVariant(event.status)} className="shrink-0 capitalize text-xs">
                      {event.status}
                    </Badge>
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
