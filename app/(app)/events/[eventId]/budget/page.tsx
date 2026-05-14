import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { BudgetItem, Event } from '@/lib/types'
import { Badge } from '@/components/ui/badge'

interface PageProps {
  params: Promise<{ eventId: string }>
}

function fmt(n: number | null) {
  if (n === null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default async function BudgetPage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const [{ data: event }, { data: items }] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase.from('budget_items').select('*').eq('event_id', eventId).order('created_at'),
  ])

  if (!event) notFound()

  const ev = event as Event
  const budgetList = (items ?? []) as BudgetItem[]
  const totalEstimated = budgetList.reduce((s, i) => s + (i.estimated_cost ?? 0), 0)
  const totalActual = budgetList.reduce((s, i) => s + (i.actual_cost ?? 0), 0)

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Budget</h2>
          <p className="text-sm text-muted-foreground">{budgetList.length} line item{budgetList.length !== 1 ? 's' : ''}</p>
        </div>
        {ev.budget_target && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Target</p>
            <p className="text-lg font-semibold">{fmt(ev.budget_target)}</p>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total estimated</p>
          <p className="text-xl font-semibold mt-1">{fmt(totalEstimated)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total actual</p>
          <p className="text-xl font-semibold mt-1">{fmt(totalActual)}</p>
        </div>
      </div>

      {budgetList.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No budget items yet. Tell Glenn about your costs.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Item</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Category</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Estimated</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Actual</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {budgetList.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium">{item.description}</p>
                    {item.ai_generated && <Badge variant="outline" className="text-xs mt-0.5">AI</Badge>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.category}</td>
                  <td className="px-4 py-3 text-right">{fmt(item.estimated_cost)}</td>
                  <td className="px-4 py-3 text-right">{fmt(item.actual_cost)}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="text-xs capitalize">{item.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
