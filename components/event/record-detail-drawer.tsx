'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, X, Clock, ChevronRight } from 'lucide-react'
import type { TimelineItem } from '@/lib/types'
import { formatTimelineDateTime } from '@/lib/timeline-format'

interface SameUpdateRecord { record_type: string; id: string; label: string }
interface DetailBundle {
  source_message: { id: string; content: string; created_at: string } | null
  proposal: { rationale: string | null } | null
  same_update: SameUpdateRecord[]
}

const TYPE_PILL: Record<TimelineItem['type'], string> = {
  deadline:  'bg-rose-100 text-rose-700',
  milestone: 'bg-indigo-100 text-indigo-700',
  planning:  'bg-amber-100 text-amber-700',
  task:      'bg-emerald-100 text-emerald-700',
}

const TYPE_LABEL: Record<TimelineItem['type'], string> = {
  deadline: 'Deadline', milestone: 'Milestone', planning: 'Planning', task: 'Task',
}

const RECORD_TYPE_LABEL: Record<string, string> = {
  task: 'Task', vendor: 'Vendor', budget_item: 'Budget', timeline_item: 'Run of Show',
  decision: 'Decision', risk: 'Risk', open_question: 'Question',
}

const TAB_BY_TYPE: Record<string, string> = {
  task: 'tasks', vendor: 'vendors', budget_item: 'budget', timeline_item: 'timeline',
  decision: 'decisions', risk: 'risks', open_question: 'open-questions',
}

function planHref(eventId: string, s: SameUpdateRecord): string | null {
  const tab = TAB_BY_TYPE[s.record_type]
  return tab ? `/events/${eventId}/plan?tab=${tab}&highlight=${s.id}` : null
}

interface RecordDetailDrawerProps {
  eventId: string
  item: TimelineItem
  onClose: () => void
}

export function RecordDetailDrawer({ eventId, item, onClose }: RecordDetailDrawerProps) {
  const [bundle, setBundle] = useState<DetailBundle | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/events/${eventId}/records/timeline_item/${item.id}/provenance`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error('failed')
        if (!cancelled) setBundle(data as DetailBundle)
      })
      .catch(() => {
        if (!cancelled) setBundle({ source_message: null, proposal: null, same_update: [] })
      })
    return () => { cancelled = true }
  }, [eventId, item.id])

  const when = formatTimelineDateTime(item.starts_at, item.ends_at)
  const siblings = bundle?.same_update ?? []

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close detail" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l bg-card shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide ${TYPE_PILL[item.type]}`}>
            {TYPE_LABEL[item.type]}
          </span>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h2 className="text-lg font-semibold leading-snug tracking-tight">{item.title}</h2>
          {when && (
            <div className="mt-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <Clock className="h-3.5 w-3.5 opacity-60" /> {when}
            </div>
          )}
          {item.description && <p className="mt-3.5 text-sm leading-relaxed text-muted-foreground">{item.description}</p>}

          {siblings.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">From the same update</p>
              <div className="space-y-1.5">
                {siblings.map((s) => {
                  const href = planHref(eventId, s)
                  const inner = (
                    <>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">
                        <span className="text-muted-foreground">{RECORD_TYPE_LABEL[s.record_type] ?? s.record_type} · </span>
                        {s.label}
                      </span>
                      {href && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    </>
                  )
                  return href ? (
                    <Link key={`${s.record_type}-${s.id}`} href={href} onClick={onClose} className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/40">
                      {inner}
                    </Link>
                  ) : (
                    <div key={`${s.record_type}-${s.id}`} className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2.5">
                      {inner}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mt-5 rounded-xl border bg-muted/20 p-3.5">
            <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3 w-3" /> AI source
            </p>
            {item.ai_generated && bundle?.source_message ? (
              <>
                <p className="text-xs leading-relaxed text-muted-foreground">Built from your note to Glenn.</p>
                {bundle.proposal?.rationale && (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground/90">{bundle.proposal.rationale}</p>
                )}
                <Link href={`/events/${eventId}/chat?source=${bundle.source_message.id}`} className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  View source
                </Link>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Added to the plan manually.</p>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
