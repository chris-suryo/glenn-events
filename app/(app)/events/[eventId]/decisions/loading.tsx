import { Skeleton } from '@/components/ui/skeleton'

export default function DecisionsLoading() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="space-y-1">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-3.5 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
