'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import type { AiRun, EventFile, ProposedUpdate } from '@/lib/types'
import { ProposedUpdatesQueue } from './proposed-updates-queue'
import { Badge } from '@/components/ui/badge'
import { ClipboardList, X } from 'lucide-react'

interface ReviewDrawerContextValue {
  open: () => void
  close: () => void
  count: number
}

const ReviewDrawerContext = createContext<ReviewDrawerContextValue>({
  open: () => {},
  close: () => {},
  count: 0,
})

/**
 * Opens the persistent Review drawer from anywhere inside the event layout —
 * e.g. the Command Center "Review pending" card. Returns a no-op when rendered
 * outside the companion (defensive; the companion wraps every event route).
 */
export function useReviewDrawer(): ReviewDrawerContextValue {
  return useContext(ReviewDrawerContext)
}

interface ReviewCompanionProps {
  eventId: string
  pendingUpdates: ProposedUpdate[]
  aiRuns: AiRun[]
  files: EventFile[]
  children: ReactNode
}

export function ReviewCompanion({ eventId, pendingUpdates, aiRuns, files, children }: ReviewCompanionProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const count = pendingUpdates.length

  const openDrawer = useCallback(() => setOpen(true), [])
  const closeDrawer = useCallback(() => setOpen(false), [])

  // Ask Glenn already embeds the same review surface inline — don't double it up.
  const showCompanion = !(pathname?.endsWith('/chat') ?? false)

  return (
    <ReviewDrawerContext.Provider value={{ open: openDrawer, close: closeDrawer, count }}>
      {children}

      {showCompanion && count > 0 && (
        <button
          type="button"
          onClick={openDrawer}
          aria-label={`Review ${count} update${count !== 1 ? 's' : ''}`}
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card px-3.5 py-2 text-sm font-medium text-primary shadow-lg shadow-black/5 transition-colors hover:bg-primary/5"
        >
          <ClipboardList className="h-4 w-4" />
          <span className="hidden sm:inline">Review</span>
          <Badge className="h-5 px-1.5 text-xs">{count}</Badge>
          <span>update{count !== 1 ? 's' : ''}</span>
        </button>
      )}

      {showCompanion && open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close review"
            onClick={closeDrawer}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col border-l bg-card shadow-xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  Review
                  {count > 0 && (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                      {count}
                    </span>
                  )}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Review what Glenn found before it changes the plan.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={closeDrawer}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <ProposedUpdatesQueue
                updates={pendingUpdates}
                aiRuns={aiRuns}
                files={files}
                eventId={eventId}
              />
            </div>
          </aside>
        </div>
      )}
    </ReviewDrawerContext.Provider>
  )
}
