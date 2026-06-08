import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Vendor } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Users } from 'lucide-react'
import { VendorStatusButton } from '@/components/event/vendor-status-button'
import { AiSourceBadge } from '@/components/event/ai-source-badge'

interface PageProps {
  params: Promise<{ eventId: string }>
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
                  <VendorStatusButton
                    vendorId={vendor.id}
                    eventId={eventId}
                    currentStatus={vendor.status}
                  />
                </div>
                {vendor.estimated_cost && (
                  <p className="text-xs text-muted-foreground">
                    Est. {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(vendor.estimated_cost)}
                  </p>
                )}
                {vendor.notes && <p className="text-xs text-muted-foreground line-clamp-2">{vendor.notes}</p>}
                {vendor.ai_generated && (
                  <AiSourceBadge eventId={eventId} sourceMessageId={vendor.source_message_id} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
