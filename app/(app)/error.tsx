'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Route-level error boundary for the app shell. A transient page/Supabase error
// renders here — inside the sidebar+header layout — instead of replacing the
// whole shell via the root global-error. Event data is untouched; the user can
// retry the segment or return to the dashboard.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-1.5">
          <p className="text-lg font-semibold tracking-tight">Something went wrong</p>
          <p className="text-sm text-muted-foreground">
            This view hit an unexpected error. Your event data is safe — try again, or head back to
            your dashboard.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Link href="/dashboard" className={cn(buttonVariants({ variant: 'outline' }))}>
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
