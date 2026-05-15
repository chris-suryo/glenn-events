'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ProposedUpdate, UpdateType } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, Loader2, ClipboardList } from 'lucide-react'
import { toast } from 'sonner'

interface ProposedUpdatesQueueProps {
  updates: ProposedUpdate[]
  eventId: string
}

const TYPE_LABELS: Record<UpdateType, string> = {
  task: 'Task',
  vendor: 'Vendor',
  budget_item: 'Budget',
  timeline_item: 'Timeline',
  decision: 'Decision',
  risk: 'Risk',
  open_question: 'Question',
}

const TYPE_COLORS: Record<UpdateType, string> = {
  task: 'bg-sky-50 text-sky-700 border-sky-200',
  vendor: 'bg-violet-50 text-violet-700 border-violet-200',
  budget_item: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  timeline_item: 'bg-amber-50 text-amber-700 border-amber-200',
  decision: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  risk: 'bg-rose-50 text-rose-700 border-rose-200',
  open_question: 'bg-slate-50 text-slate-600 border-slate-200',
}

const TYPE_STRIPE: Record<UpdateType, string> = {
  task: 'border-l-sky-400',
  vendor: 'border-l-violet-400',
  budget_item: 'border-l-emerald-400',
  timeline_item: 'border-l-amber-400',
  decision: 'border-l-yellow-400',
  risk: 'border-l-rose-500',
  open_question: 'border-l-slate-400',
}

function getUpdateTitle(update: ProposedUpdate): string {
  const p = update.payload_json as unknown as Record<string, unknown>
  return (p.title as string) || (p.question as string) || (p.name as string) || 'Update'
}

function getUpdateSummary(update: ProposedUpdate): string | null {
  const p = update.payload_json as unknown as Record<string, unknown>
  if (p.description && typeof p.description === 'string') return p.description
  if (p.notes && typeof p.notes === 'string') return p.notes
  return null
}

async function reviewUpdate(updateId: string, action: 'approve' | 'reject') {
  const res = await fetch(`/api/updates/${updateId}/${action}`, { method: 'POST' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Failed to update')
  }
}

export function ProposedUpdatesQueue({ updates }: ProposedUpdatesQueueProps) {
  const router = useRouter()
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [isPendingBulk, startBulkTransition] = useTransition()

  async function handleSingle(id: string, action: 'approve' | 'reject') {
    setProcessingIds((s) => new Set(s).add(id))
    try {
      await reviewUpdate(id, action)
      toast.success(action === 'approve' ? 'Update applied.' : 'Update rejected.')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setProcessingIds((s) => { const n = new Set(s); n.delete(id); return n })
    }
  }

  async function handleBulk(action: 'approve' | 'reject') {
    startBulkTransition(async () => {
      try {
        await Promise.all(updates.map((u) => reviewUpdate(u.id, action)))
        toast.success(
          action === 'approve'
            ? `${updates.length} update${updates.length !== 1 ? 's' : ''} applied.`
            : `${updates.length} update${updates.length !== 1 ? 's' : ''} rejected.`
        )
        router.refresh()
      } catch {
        toast.error('Some updates could not be processed.')
        router.refresh()
      }
    })
  }

  if (updates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
        <ClipboardList className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No pending updates.<br />Tell Glenn what changed to get started.</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-3">
      {/* Bulk actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          disabled={isPendingBulk}
          onClick={() => handleBulk('approve')}
          className="flex-1"
        >
          {isPendingBulk ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Approve all'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPendingBulk}
          onClick={() => handleBulk('reject')}
          className="flex-1"
        >
          Reject all
        </Button>
      </div>

      {/* Individual updates */}
      {updates.map((update) => {
        const isProcessing = processingIds.has(update.id)
        const title = getUpdateTitle(update)
        const summary = getUpdateSummary(update)

        return (
          <div
            key={update.id}
            className={`rounded-lg border border-l-[3px] bg-card shadow-[0px_1px_3px_rgba(0,0,0,0.06)] p-3 space-y-2.5 ${TYPE_STRIPE[update.update_type]}`}
          >
            <div className="flex items-start gap-2">
              <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium shrink-0 ${TYPE_COLORS[update.update_type]}`}>
                {TYPE_LABELS[update.update_type]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug">{title}</p>
                {summary && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{summary}</p>
                )}
              </div>
            </div>

            {update.rationale && (
              <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">{update.rationale}</p>
            )}

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="flex-1 h-7 text-xs"
                disabled={isProcessing}
                onClick={() => handleSingle(update.id, 'approve')}
              >
                {isProcessing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <><CheckCircle2 className="h-3 w-3 mr-1" />Apply</>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-xs"
                disabled={isProcessing}
                onClick={() => handleSingle(update.id, 'reject')}
              >
                <XCircle className="h-3 w-3 mr-1" />Reject
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
