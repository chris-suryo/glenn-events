import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Vendor } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

interface PageProps {
  params: Promise<{ eventId: string }>
}

function statusVariant(status: Vendor['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'confirmed': return 'default'
    case 'contacted': return 'secondary'
    case 'prospecting': return 'outline'
    case 'cancelled': return 'destructive'
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
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Vendors</h2>
        <p className="text-sm text-muted-foreground">{vendorList.length} vendor{vendorList.length !== 1 ? 's' : ''}</p>
      </div>

      {vendorList.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No vendors yet. Tell Glenn about your vendors.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {vendorList.map((vendor) => (
            <Card key={vendor.id} className="border">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{vendor.name}</p>
                    {vendor.category && <p className="text-xs text-muted-foreground">{vendor.category}</p>}
                  </div>
                  <Badge variant={statusVariant(vendor.status)} className="text-xs capitalize shrink-0">
                    {vendor.status}
                  </Badge>
                </div>
                {vendor.estimated_cost && (
                  <p className="text-xs text-muted-foreground">
                    Est. {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(vendor.estimated_cost)}
                  </p>
                )}
                {vendor.notes && <p className="text-xs text-muted-foreground line-clamp-2">{vendor.notes}</p>}
                {vendor.ai_generated && <Badge variant="outline" className="text-xs">AI generated</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
