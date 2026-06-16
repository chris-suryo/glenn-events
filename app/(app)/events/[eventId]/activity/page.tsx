import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { ActivityLog, EventFile } from '@/lib/types'
import { activityActor, activityDetail, activityDot, activityLabel, activityPlanHref, activityRunId, timeAgo } from '@/lib/activity'
import { Activity, FileText } from 'lucide-react'

interface PageProps {
  params: Promise<{ eventId: string }>
}

function metaNumber(entry: ActivityLog | undefined, key: string): number | null {
  if (!entry || typeof entry.metadata_json !== 'object' || entry.metadata_json === null) return null
  const value = (entry.metadata_json as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : null
}

// One activity row (used for flat singles and batch children).
function Row({ entry, eventId, actor }: { entry: ActivityLog; eventId: string; actor: string | null }) {
  const href = activityPlanHref(entry, eventId)
  const detail = activityDetail(entry)
  const label = activityLabel(entry)
  return (
    <div className="relative flex items-start gap-3 pb-4 pl-6">
      <span className={`absolute left-0 mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-background shrink-0 ${activityDot(entry.action)}`} />
      <div className="flex-1 min-w-0 pt-0.5">
        {href ? (
          <Link href={href} className="text-sm leading-snug hover:text-primary hover:underline underline-offset-2 transition-colors">
            {label}
          </Link>
        ) : (
          <p className="text-sm leading-snug">{label}</p>
        )}
        {detail || actor ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[actor, detail].filter(Boolean).join(' · ')}
          </p>
        ) : null}
      </div>
      <span className="text-xs text-muted-foreground shrink-0 pt-0.5">{timeAgo(entry.created_at)}</span>
    </div>
  )
}

export default async function ActivityPage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  const [{ data: event }, { data: entries }, { data: files }] = await Promise.all([
    supabase.from('events').select('id, name').eq('id', eventId).single(),
    supabase
      .from('activity_log')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(80),
    supabase.from('files').select('ai_run_id, filename, display_name, source_message_id').eq('event_id', eventId),
  ])

  if (!event) notFound()

  const log = (entries ?? []) as ActivityLog[]

  // ai_run_id → source file (for batch headers + source links)
  const fileByRun = new Map<string, { name: string; sourceMessageId: string | null }>()
  for (const f of (files ?? []) as Partial<EventFile>[]) {
    if (f.ai_run_id) {
      fileByRun.set(f.ai_run_id, {
        name: f.display_name || f.filename || 'a file',
        sourceMessageId: f.source_message_id ?? null,
      })
    }
  }

  // Group entries that share an ai_run into one batch, positioned at the newest
  // entry. Runs with a single entry, and manual edits, stay as flat rows.
  const byRun = new Map<string, ActivityLog[]>()
  for (const e of log) {
    const runId = activityRunId(e)
    if (!runId) continue
    const arr = byRun.get(runId) ?? []
    arr.push(e)
    byRun.set(runId, arr)
  }

  type Item = { kind: 'single'; entry: ActivityLog } | { kind: 'batch'; runId: string; entries: ActivityLog[] }
  const items: Item[] = []
  const emitted = new Set<string>()
  for (const e of log) {
    const runId = activityRunId(e)
    if (!runId) {
      items.push({ kind: 'single', entry: e })
      continue
    }
    if (emitted.has(runId)) continue
    emitted.add(runId)
    const group = byRun.get(runId)!
    if (group.length >= 2) items.push({ kind: 'batch', runId, entries: group })
    else items.push({ kind: 'single', entry: e })
  }

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
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
              {items.map((item) => {
                if (item.kind === 'single') {
                  return (
                    <Row
                      key={item.entry.id}
                      entry={item.entry}
                      eventId={eventId}
                      actor={activityActor(item.entry, userId)}
                    />
                  )
                }

                // Batch card — the source-batch audit story.
                const ascending = [...item.entries].sort((a, b) => a.created_at.localeCompare(b.created_at))
                const newest = item.entries[0]
                const file = fileByRun.get(item.runId)
                const proposed = ascending.find((e) => e.action === 'proposed_updates_created')
                const total = metaNumber(proposed, 'total')
                const appliedCount = item.entries.filter(
                  (e) => e.action === 'proposed_update_applied' || e.action === 'proposed_update_corrected',
                ).length
                const removedCount = item.entries.filter((e) => e.action === 'record_archived').length
                const dismissedCount = item.entries.filter((e) => e.action === 'proposed_update_rejected').length
                const reviewer =
                  item.entries.map((e) => activityActor(e, userId)).find((a) => a) ?? 'You'

                const title = file ? `Uploaded ${file.name}` : 'Glenn extraction'
                const storyParts: string[] = []
                if (total !== null) storyParts.push(`Glenn proposed ${total} update${total !== 1 ? 's' : ''}`)
                if (appliedCount > 0) storyParts.push(`${reviewer} applied ${appliedCount}`)
                if (removedCount > 0) storyParts.push(`${reviewer} removed ${removedCount}`)
                if (dismissedCount > 0) storyParts.push(`${reviewer} dismissed ${dismissedCount}`)
                const children = ascending.filter(
                  (e) => e.action !== 'proposed_updates_created' && e.action !== 'file_uploaded',
                )

                return (
                  <div key={item.runId} className="relative pb-4 pl-6">
                    <span className="absolute left-0 mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-background shrink-0 bg-violet-500" />
                    <details open className="rounded-lg border bg-card">
                      <summary className="flex cursor-pointer list-none items-start gap-2.5 px-3 py-2.5">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium leading-snug">{title}</p>
                          {storyParts.length > 0 && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{storyParts.join(' · ')}</p>
                          )}
                          {file?.sourceMessageId && (
                            <Link
                              href={`/events/${eventId}/chat?source=${file.sourceMessageId}`}
                              className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                            >
                              View source
                            </Link>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{timeAgo(newest.created_at)}</span>
                      </summary>
                      {children.length > 0 && (
                        <div className="border-t px-3 pt-3">
                          {children.map((child) => (
                            <Row key={child.id} entry={child} eventId={eventId} actor={null} />
                          ))}
                        </div>
                      )}
                    </details>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
