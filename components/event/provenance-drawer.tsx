'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ActivityLog, Json } from '@/lib/types'
import { activityDot, activityLabel, timeAgo } from '@/lib/activity'
import { formatDistanceToNow } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Sparkles, X } from 'lucide-react'

interface ProvenanceBundle {
  record: {
    id: string
    record_type: string
    label: string
    ai_generated: boolean
    created_at: string
  }
  source_message: { id: string; content: string; created_at: string } | null
  proposal: {
    rationale: string | null
    operation: 'insert' | 'update' | 'archive'
    status: string
    payload_json: Json
    target_snapshot_json: Json | null
    reviewed_at: string | null
    reviewer_name: string | null
  } | null
  understood_summary: string[]
  trail: ActivityLog[]
}

interface ProvenanceDrawerProps {
  eventId: string
  recordType: string
  recordId: string
  onClose: () => void
}

const OPERATION_HEADLINE: Record<string, string> = {
  insert: 'Added to the plan',
  update: 'Correction to an existing record',
  archive: 'Removed from the plan',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fieldLabel(key: string): string {
  const text = key.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatValue(key: string, value: unknown): string {
  if (typeof value === 'number' && key.endsWith('_cost')) return `$${value.toLocaleString()}`
  return String(value)
}

function correctionDiffLines(snapshot: Json | null, payload: Json): string[] {
  if (!isRecord(snapshot) || !isRecord(payload)) return []
  const lines: string[] = []
  for (const [key, after] of Object.entries(payload)) {
    if (key === 'archive_reason' || after === null || after === undefined) continue
    if (!(key in snapshot)) continue
    const before = snapshot[key]
    if (before === after) continue
    lines.push(
      before === null || before === undefined || before === ''
        ? `${fieldLabel(key)}: ${formatValue(key, after)}`
        : `${fieldLabel(key)}: ${formatValue(key, before)} → ${formatValue(key, after)}`
    )
  }
  return lines
}

function archiveReason(payload: Json): string | null {
  if (!isRecord(payload)) return null
  const reason = payload.archive_reason
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </section>
  )
}

export function ProvenanceDrawer({ eventId, recordType, recordId, onClose }: ProvenanceDrawerProps) {
  const [bundle, setBundle] = useState<ProvenanceBundle | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/events/${eventId}/records/${recordType}/${recordId}/provenance`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to load provenance')
        if (!cancelled) setBundle(data as ProvenanceBundle)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load provenance')
      })
    return () => {
      cancelled = true
    }
  }, [eventId, recordType, recordId])

  const proposal = bundle?.proposal ?? null
  const diffLines = proposal && proposal.operation === 'update'
    ? correctionDiffLines(proposal.target_snapshot_json, proposal.payload_json)
    : []
  const reason = proposal && proposal.operation === 'archive' ? archiveReason(proposal.payload_json) : null

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close provenance"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              Where this came from
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold">{bundle?.record.label ?? '…'}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {error ? (
            <p className="text-sm text-muted-foreground">{error}</p>
          ) : !bundle ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {bundle.source_message ? (
                <Section title="You told Glenn">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{bundle.source_message.content}</p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground" suppressHydrationWarning>
                      {formatDistanceToNow(bundle.source_message.created_at)}
                    </p>
                  </div>
                </Section>
              ) : null}

              {proposal ? (
                <Section title="Glenn proposed">
                  <p className="text-sm font-medium">{OPERATION_HEADLINE[proposal.operation] ?? 'Plan update'}</p>
                  {proposal.rationale ? (
                    <p className="text-xs leading-relaxed text-muted-foreground">{proposal.rationale}</p>
                  ) : null}
                  {bundle.understood_summary.length > 0 ? (
                    <ul className="list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-muted-foreground">
                      {bundle.understood_summary.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </Section>
              ) : null}

              {diffLines.length > 0 ? (
                <Section title="What changed">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
                    <div className="space-y-1 text-xs text-foreground">
                      {diffLines.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  </div>
                </Section>
              ) : null}

              {reason ? (
                <Section title="Removal reason">
                  <p className="text-xs leading-relaxed text-rose-800">{reason}</p>
                </Section>
              ) : null}

              {proposal?.reviewed_at ? (
                <Section title="Approved">
                  <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {proposal.reviewer_name ? `By ${proposal.reviewer_name} · ` : ''}
                    {formatDistanceToNow(proposal.reviewed_at)}
                  </p>
                </Section>
              ) : null}

              {bundle.trail.length > 0 ? (
                <Section title="Record history">
                  <div className="relative space-y-0">
                    <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />
                    {bundle.trail.map((entry) => (
                      <div key={entry.id} className="relative flex items-start gap-2.5 pb-3 pl-5">
                        <span className={`absolute left-0 mt-1 h-2.5 w-2.5 rounded-full border-2 border-card shrink-0 ${activityDot(entry.action)}`} />
                        <p className="flex-1 min-w-0 text-xs leading-snug">{activityLabel(entry)}</p>
                        <span className="shrink-0 text-[11px] text-muted-foreground" suppressHydrationWarning>
                          {timeAgo(entry.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </Section>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
          {bundle?.source_message ? (
            <Link
              href={`/events/${eventId}/chat?source=${bundle.source_message.id}`}
              className="text-xs font-medium text-primary hover:underline"
            >
              Open in Ask Glenn
            </Link>
          ) : (
            <span />
          )}
          <Link
            href={`/events/${eventId}/activity`}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            View all activity
          </Link>
        </div>
      </aside>
    </div>
  )
}
