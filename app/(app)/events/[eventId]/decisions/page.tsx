import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Decision } from '@/lib/types'
import { DecisionResolveButton } from '@/components/event/decision-resolve-button'
import { AiSourceBadge } from '@/components/event/ai-source-badge'

interface PageProps {
  params: Promise<{ eventId: string }>
}

export default async function DecisionsPage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const [{ data: event }, { data: decisions }] = await Promise.all([
    supabase.from('events').select('id, name').eq('id', eventId).single(),
    supabase.from('decisions').select('*').eq('event_id', eventId).order('created_at'),
  ])

  if (!event) notFound()

  const list = (decisions ?? []) as Decision[]
  const pending = list.filter((d) => d.status === 'pending')
  const decided = list.filter((d) => d.status === 'decided')

  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Decisions</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{pending.length} pending · {decided.length} decided</p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-14 text-center">
          <p className="text-sm text-muted-foreground">No decisions tracked yet. Tell Glenn about things that need a decision.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {list.map((dec) => (
            <div key={dec.id} className="rounded-lg border bg-card p-3.5 space-y-1.5 shadow-[0px_1px_2px_rgba(0,0,0,0.04)]">
              <div className="flex items-start gap-2">
                <p className="text-sm font-medium flex-1 tracking-tight">{dec.title}</p>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize shrink-0
                  ${dec.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {dec.status}
                </span>
              </div>
              {dec.description && <p className="text-xs text-muted-foreground">{dec.description}</p>}
              {dec.decision && (
                <div className="rounded-md bg-primary/[0.05] border border-primary/10 px-3 py-2">
                  <p className="text-xs font-medium text-primary">Decision: {dec.decision}</p>
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {dec.ai_generated && (
                  <AiSourceBadge eventId={eventId} sourceMessageId={dec.source_message_id} />
                )}
                {dec.status === 'pending' && (
                  <DecisionResolveButton decisionId={dec.id} eventId={eventId} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
