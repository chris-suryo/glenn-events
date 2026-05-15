import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Vendor } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Users } from 'lucide-react'

interface PageProps {
  params: Promise<{ eventId: string }>
}

function statusPill(status: Vendor['status']) {
  switch (status) {
    case 'confirmed': return 'bg-emerald-50 text-emerald-700'
    case 'contacted': return 'bg-sky-50 text-sky-700'
    case 'prospect': return 'bg-slate-100 text-slate-600'
    case 'declined': return 'bg-rose-50 text-rose-700'
  }
}

export default async function VendorsPage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const [{ data: event }, { data: vendors }] = await Promise.all([
    supabase.from('events').select('id, name').eq('id', eventId).single(),
    supabase.from('vendors').select('*').eq('event_id', eventId).order('created_at'),
  ])

  if (!event) notFound()

  const vendorList = (vendors ?? []) as Vendor[]

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Vendors</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{vendorList.length} vendor{vendorList.length !== 1 ? 's' : ''}</p>
      </div>

      {vendorList.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-14 flex flex-col items-center gap-3 text-center">
          <Users className="h-8 w-8 text-muted-foreground/25" />
          <p className="text-sm text-muted-foreground">No vendors yet. Tell Glenn about your vendors.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {vendorList.map((vendor) => (
            <Card key={vendor.id} className="border shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold tracking-tight">{vendor.name}</p>
                    {vendor.category && <p className="text-xs text-muted-foreground">{vendor.category}</p>}
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize shrink-0 ${statusPill(vendor.status)}`}>
                    {vendor.status}
                  </span>
                </div>
                {vendor.estimated_cost && (
                  <p className="text-xs text-muted-foreground">
                    Est. {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(vendor.estimated_cost)}
                  </p>
                )}
                {vendor.notes && <p className="text-xs text-muted-foreground line-clamp-2">{vendor.notes}</p>}
                {vendor.ai_generated && <Badge variant="outline" className="text-xs">AI</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
