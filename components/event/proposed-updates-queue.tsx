'use client'

import Link from 'next/link'
import type { AiRun, EventFile, ProposedUpdate } from '@/lib/types'
import { buildReviewPackages } from '@/lib/review'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { ReviewPackageCard } from './review-package-card'
import { CheckCircle2, Sparkles } from 'lucide-react'

interface ProposedUpdatesQueueProps {
  updates: ProposedUpdate[]
  aiRuns: AiRun[]
  files: EventFile[]
  eventId: string
  onClarify?: (input: { update: ProposedUpdate; title: string; answer: string }) => Promise<{ createdCount: number }>
}

export function ProposedUpdatesQueue({ updates, aiRuns, files, eventId, onClarify }: ProposedUpdatesQueueProps) {
  const packages = buildReviewPackages(updates, aiRuns, files)

  if (updates.length === 0) {
    const hasHistory = aiRuns.some((run) => run.status === 'completed')
    return hasHistory ? (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <CheckCircle2 className="size-7 text-emerald-500/60" />
        <p className="text-sm font-medium text-foreground">All caught up</p>
        <p className="max-w-[200px] text-xs text-muted-foreground">Everything has been reviewed. Tell Glenn what changed and new updates will appear here.</p>
        <Link
          href={`/events/${eventId}/plan`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-1')}
        >
          See the plan →
        </Link>
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <Sparkles className="size-7 text-muted-foreground/25" />
        <p className="text-sm font-medium text-muted-foreground">Nothing to review yet</p>
        <p className="max-w-[200px] text-xs text-muted-foreground">Tell Glenn what changed and proposed updates will appear here for your review.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {packages.map((pkg, index) => (
        <ReviewPackageCard
          key={pkg.aiRunId}
          pkg={pkg}
          eventId={eventId}
          isLatest={index === 0}
          defaultExpanded={index === 0}
          onClarify={onClarify}
        />
      ))}
    </div>
  )
}
