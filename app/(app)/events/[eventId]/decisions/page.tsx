import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Decision } from '@/lib/types'
import { Badge } from '@/components/ui/badge'

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
  const open = list.filter((d) => d.status === 'open')
  const decided = list.filter((d) => d.status === 'decided')

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Decisions</h2>
        <p className="text-sm text-muted-foreground">{open.length} open · {decided.length} decided</p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No decisions tracked yet. Tell Glenn about things that need a decision.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((dec) => (
            <div key={dec.id} className="rounded-lg border p-3.5 space-y-1.5">
              <div className="flex items-start gap-2">
                <p className="text-sm font-medium flex-1">{dec.title}</p>
                <Badge variant={dec.status === 'open' ? 'secondary' : 'default'} className="text-xs capitalize shrink-0">
                  {dec.status}
                </Badge>
              </div>
              {dec.description && <p className="text-xs text-muted-foreground">{dec.description}</p>}
              {dec.decision && (
                <div className="rounded-md bg-accent/50 px-3 py-2">
                  <p className="text-xs font-medium text-accent-foreground">Decision: {dec.decision}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
