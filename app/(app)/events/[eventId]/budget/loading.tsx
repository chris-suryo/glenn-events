import { Skeleton } from '@/components/ui/skeleton'

export default function BudgetLoading() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="space-y-1">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border bg-card p-3.5">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
