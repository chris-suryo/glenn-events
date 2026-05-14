import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Risk } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle } from 'lucide-react'

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
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Risks</h2>
        <p className="text-sm text-muted-foreground">{open.length} open risk{open.length !== 1 ? 's' : ''}</p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No risks tracked. Tell Glenn about anything that could go wrong.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((risk) => (
            <div key={risk.id} className={`rounded-lg border p-3.5 space-y-1.5 ${risk.severity === 'high' && risk.status === 'open' ? 'border-destructive/30' : ''}`}>
              <div className="flex items-start gap-2">
                <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${risk.severity === 'high' ? 'text-destructive' : 'text-muted-foreground'}`} />
                <p className="text-sm font-medium flex-1">{risk.title}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant={risk.severity === 'high' ? 'destructive' : 'secondary'} className="text-xs capitalize">
                    {risk.severity}
                  </Badge>
                  <Badge variant="outline" className="text-xs capitalize">{risk.status}</Badge>
                </div>
              </div>
              {risk.description && <p className="text-xs text-muted-foreground pl-6">{risk.description}</p>}
              {risk.mitigation && (
                <div className="pl-6">
                  <p className="text-xs text-muted-foreground"><span className="font-medium">Mitigation:</span> {risk.mitigation}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
