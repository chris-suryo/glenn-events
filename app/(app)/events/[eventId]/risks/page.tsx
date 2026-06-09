import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Risk } from '@/lib/types'
import { AlertTriangle } from 'lucide-react'
import { RiskStatusButton } from '@/components/event/risk-status-button'
import { AiSourceBadge } from '@/components/event/ai-source-badge'

interface PageProps {
  params: Promise<{ eventId: string }>
}

export default async function RisksPage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const [{ data: event }, { data: risks }] = await Promise.all([
    supabase.from('events').select('id, name').eq('id', eventId).single(),
    supabase.from('risks').select('*').eq('event_id', eventId).order('created_at'),
  ])

  if (!event) notFound()

  const list = (risks ?? []) as Risk[]
  const open = list.filter((r) => r.status === 'open')

  return (
    <div className="h-full overflow-y-auto p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Risks</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{open.length} open risk{open.length !== 1 ? 's' : ''}</p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-14 flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground/25" />
          <p className="text-sm text-muted-foreground">No risks tracked. Tell Glenn about anything that could go wrong.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {list.map((risk) => (
            <div key={risk.id} className={`rounded-lg border bg-card p-3.5 space-y-1.5 shadow-[0px_1px_2px_rgba(0,0,0,0.04)]
              ${risk.severity === 'high' && risk.status === 'open' ? 'border-l-[3px] border-l-rose-400' : ''}`}>
              <div className="flex items-start gap-2">
                <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${risk.severity === 'high' ? 'text-rose-500' : 'text-muted-foreground/50'}`} />
                <p className="text-sm font-medium flex-1 tracking-tight">{risk.title}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize
                    ${risk.severity === 'high' ? 'bg-rose-50 text-rose-700' :
                      risk.severity === 'medium' ? 'bg-amber-50 text-amber-700' :
                      'bg-slate-100 text-slate-600'}`}>
                    {risk.severity}
                  </span>
                  <RiskStatusButton
                    riskId={risk.id}
                    eventId={eventId}
                    currentStatus={risk.status}
                  />
                </div>
              </div>
              {risk.description && <p className="text-xs text-muted-foreground pl-6">{risk.description}</p>}
              {risk.mitigation && (
                <div className="pl-6 mt-1">
                  <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground/70">Mitigation:</span> {risk.mitigation}</p>
                </div>
              )}
              {risk.ai_generated && (
                <div className="pl-6">
                  <AiSourceBadge eventId={eventId} sourceMessageId={risk.source_message_id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
