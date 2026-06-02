import { Skeleton } from '@/components/ui/skeleton'

export default function ChatLoading() {
  return (
    <div className="flex flex-col lg:flex-row h-full gap-0">
      {/* Message thread */}
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-6 w-24" />
        {[{ w: 'w-3/4', self: false }, { w: 'w-2/3', self: true }, { w: 'w-4/5', self: false }].map((m, i) => (
          <div key={i} className={`flex ${m.self ? 'justify-end' : 'justify-start'}`}>
            <Skeleton className={`h-16 ${m.w} rounded-xl`} />
          </div>
        ))}
      </div>
      {/* Updates queue */}
      <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l p-4 space-y-3">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-3 space-y-2">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-7 flex-1" />
              <Skeleton className="h-7 flex-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
