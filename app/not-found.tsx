import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">404</p>
      <p className="text-lg font-semibold tracking-tight">We couldn&rsquo;t find that page</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        The link may be broken, or the event may have been removed.
      </p>
      <Link href="/dashboard" className={cn(buttonVariants(), 'mt-1')}>
        Back to dashboard
      </Link>
    </div>
  )
}
