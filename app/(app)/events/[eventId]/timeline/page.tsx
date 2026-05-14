import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { TimelineItem } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Calendar } from 'lucide-react'

interface PageProps {
  params: Promise<{ eventId: string }>
}

export default async function TimelinePage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const [{ data: event }, { data: items }] = await Promise.all([
    supabase.from('events').select('id, name').eq('id', eventId).single(),
    supabase.from('timeline_items').select('*').eq('event_id', eventId).order('starts_at', { ascending: true }),
  ])

  if (!event) notFound()

  const list = (items ?? []) as TimelineItem[]

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Timeline</h2>
        <p className="text-sm text-muted-foreground">{list.length} item{list.length !== 1 ? 's' : ''}</p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No timeline items yet. Tell Glenn about key dates and milestones.</p>
        </div>
      ) : (
        <div className="relative space-y-3 pl-6">
          <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
          {list.map((item) => (
            <div key={item.id} className="relative">
              <div className="absolute -left-4 mt-1.5 h-2 w-2 rounded-full bg-primary" />
              <div className="rounded-lg border p-3.5">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.title}</p>
                    {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                    {item.starts_at && (
                      <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(item.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {item.ends_at && item.ends_at !== item.starts_at && (
                          <> – {new Date(item.ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                        )}
                      </div>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs capitalize shrink-0">{item.type}</Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
