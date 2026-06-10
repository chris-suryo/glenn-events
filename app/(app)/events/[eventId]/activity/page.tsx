import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { ActivityLog } from '@/lib/types'
import { Activity } from 'lucide-react'

interface PageProps {
  params: Promise<{ eventId: string }>
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  task:          'task',
  vendor:        'vendor',
  budget_item:   'budget item',
  timeline_item: 'timeline item',
  decision:      'decision',
  risk:          'risk',
  open_question: 'open question',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function activityLabel(entry: ActivityLog): string {
  if (entry.action === 'proposed_updates_created') {
    const total = isRecord(entry.metadata_json) && typeof entry.metadata_json.total === 'number'
      ? entry.metadata_json.total
      : null
    if (total !== null) {
      return `Glenn proposed ${total} update${total !== 1 ? 's' : ''}`
    }
    return 'Glenn proposed updates'
  }

  if (entry.action === 'proposed_update_applied') {
    const entityLabel = ENTITY_TYPE_LABELS[entry.entity_type]
    return entityLabel ? `Applied ${entityLabel} update` : 'Applied plan update'
  }

  if (entry.action === 'proposed_update_rejected') {
    const updateType = isRecord(entry.metadata_json) && typeof entry.metadata_json.update_type === 'string'
      ? entry.metadata_json.update_type
      : entry.entity_type
    const entityLabel = ENTITY_TYPE_LABELS[updateType]
    return entityLabel ? `Dismissed ${entityLabel} suggestion` : 'Dismissed suggestion'
  }

  return entry.action.replace(/_/g, ' ')
}

function activityDot(action: string) {
  if (action === 'proposed_update_applied')  return 'bg-emerald-500'
  if (action === 'proposed_update_rejected') return 'bg-rose-400'
  return 'bg-indigo-400'
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

export default async function ActivityPage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const [{ data: event }, { data: entries }] = await Promise.all([
    supabase.from('events').select('id, name').eq('id', eventId).single(),
    supabase
      .from('activity_log')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (!event) notFound()

  const log = (entries ?? []) as ActivityLog[]

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 shrink-0">
        <h2 className="text-sm font-semibold">Activity</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Recent actions on this event</p>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-2xl mx-auto">
          {log.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <Activity className="h-8 w-8 text-muted-foreground/25" />
              <p className="text-sm text-muted-foreground">No activity yet.</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Activity appears here as you and Glenn make updates to the event plan.
              </p>
            </div>
          ) : (
            <div className="relative space-y-0">
              {/* Vertical line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
              {log.map((entry) => (
                <div key={entry.id} className="relative flex items-start gap-3 pb-4 pl-6">
                  {/* Colored dot */}
                  <span className={`absolute left-0 mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-background shrink-0 ${activityDot(entry.action)}`} />
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm leading-snug">
                      {activityLabel(entry)}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 pt-0.5">
                    {timeAgo(entry.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
