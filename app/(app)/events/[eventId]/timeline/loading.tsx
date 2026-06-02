import { Skeleton } from '@/components/ui/skeleton'

export default function TimelineLoading() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="space-y-1">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <Skeleton className="h-3 w-3 rounded-full" />
              <Skeleton className="w-px flex-1 mt-1" />
            </div>
            <div className="pb-4 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
