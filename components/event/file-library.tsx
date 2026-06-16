'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Upload,
  FileText,
  Image as ImageIcon,
  Loader2,
  AlertTriangle,
  ExternalLink,
  X,
  Sparkles,
} from 'lucide-react'
import type { Event, EventFile } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { uploadEventFile, UPLOAD_ACCEPT } from '@/lib/upload-file'
import { cn, formatDistanceToNow } from '@/lib/utils'

// Per-file proposal tallies, computed on the server from proposed_updates so
// the card can derive "Ready for review (N)" vs "Applied updates" vs "No
// updates found" without a new DB status.
export interface FileCardData {
  file: EventFile
  pending: number
  applied: number
  total: number
}

interface PendingUpload {
  id: string
  name: string
  phase: 'uploading' | 'reading' | 'error'
  error?: string
}

interface DisplayPill {
  label: string
  className: string
  spin?: boolean
}

const MUTED = 'bg-muted text-muted-foreground'

function deriveDisplay(file: EventFile, counts: Omit<FileCardData, 'file'>): DisplayPill {
  switch (file.status) {
    case 'extracting':
      return { label: 'Reading…', className: 'bg-amber-500/10 text-amber-600', spin: true }
    case 'failed':
      return { label: 'Failed', className: 'bg-rose-500/10 text-rose-600' }
    case 'source_only':
      return { label: 'Source only', className: MUTED }
    case 'extracted':
      return { label: 'No updates found', className: MUTED }
    case 'uploaded':
      return { label: 'Uploaded', className: MUTED }
    case 'needs_review':
      if (counts.pending > 0) return { label: 'Ready for review', className: 'bg-indigo-500/10 text-indigo-600' }
      if (counts.applied > 0) return { label: 'Applied updates', className: 'bg-emerald-500/10 text-emerald-600' }
      return { label: 'Reviewed', className: MUTED }
    default:
      return { label: 'Uploaded', className: MUTED }
  }
}

function countsLine(counts: Omit<FileCardData, 'file'>): string | null {
  if (counts.total === 0) return null
  const parts = [`${counts.total} update${counts.total !== 1 ? 's' : ''} found`]
  if (counts.pending > 0) parts.push(`${counts.pending} pending`)
  if (counts.applied > 0) parts.push(`${counts.applied} applied`)
  return parts.join(' · ')
}

function FileIcon({ mime, className }: { mime: string | null; className?: string }) {
  if (mime?.startsWith('image/')) return <ImageIcon className={className} />
  return <FileText className={className} />
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileLibrary({
  event,
  eventId,
  files,
}: {
  event: Event
  eventId: string
  files: FileCardData[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingUpload[]>([])
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const uploadOne = useCallback(
    async (file: File) => {
      const localId = crypto.randomUUID()
      setPending((p) => [...p, { id: localId, name: file.name, phase: 'uploading' }])
      const result = await uploadEventFile(file, eventId, supabase, (phase) =>
        setPending((p) => p.map((x) => (x.id === localId ? { ...x, phase } : x))),
      )
      if (!result.ok) {
        setPending((p) =>
          p.map((x) => (x.id === localId ? { ...x, phase: 'error', error: result.error ?? 'Upload failed' } : x)),
        )
        return
      }
      setPending((p) => p.filter((x) => x.id !== localId))
    },
    [eventId, supabase],
  )

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return
      setBusy(true)
      // Sequential — extraction is an LLM call per file; avoids rate spikes.
      for (const file of Array.from(fileList)) {
        await uploadOne(file)
      }
      setBusy(false)
      router.refresh()
    },
    [router, uploadOne],
  )

  const openFile = useCallback(
    async (file: EventFile) => {
      if (!file.storage_path) return
      const { data } = await supabase.storage.from('event-files').createSignedUrl(file.storage_path, 60)
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    },
    [supabase],
  )

  const hasFiles = files.length > 0 || pending.length > 0

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Event Library</h1>
        <p className="text-sm text-muted-foreground">
          Upload documents and images for {event.name}. Glenn reads them and proposes plan updates you review before
          anything changes — the file stays linked as the source.
        </p>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={cn(
          'rounded-xl border border-dashed p-6 text-center transition-colors',
          dragOver ? 'border-primary bg-primary/[0.04]' : 'border-border',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Upload className="h-5 w-5" />
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="text-sm font-medium text-primary hover:underline disabled:opacity-60"
          >
            {busy ? 'Uploading…' : 'Choose files to upload'}
          </button>
          <p className="text-xs text-muted-foreground">
            PDF, PNG, JPG, TXT, or Markdown · up to 10 MB · drag &amp; drop on desktop
          </p>
        </div>
      </div>

      {/* Pending uploads */}
      {pending.length > 0 && (
        <div className="space-y-2">
          {pending.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 text-sm">
              {p.phase === 'error' ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
              ) : (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-500" />
              )}
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className={cn('text-xs', p.phase === 'error' ? 'text-rose-600' : 'text-muted-foreground')}>
                {p.phase === 'uploading' ? 'Uploading…' : p.phase === 'reading' ? 'Reading…' : p.error}
              </span>
              {p.phase === 'error' && (
                <button
                  type="button"
                  onClick={() => setPending((prev) => prev.filter((x) => x.id !== p.id))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!hasFiles && (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No files yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Upload a vendor quote, contract, menu, itinerary, or screenshot. Glenn will pull out vendors, costs, and
            timing for you to review.
          </p>
        </div>
      )}

      {/* File cards */}
      {files.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {files.map(({ file, ...counts }) => {
            const pill = deriveDisplay(file, counts)
            const title = file.ai_suggested_name || file.display_name || file.filename
            const labels = Array.isArray(file.ai_labels) ? file.ai_labels : []
            const tally = countsLine(counts)
            return (
              <div key={file.id} className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <FileIcon mime={file.mime_type} className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium leading-tight">{title}</p>
                      <p className="truncate text-xs text-muted-foreground">{file.filename}</p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                      pill.className,
                    )}
                  >
                    {pill.spin && <Loader2 className="h-3 w-3 animate-spin" />}
                    {pill.label}
                  </span>
                </div>

                {(file.ai_category || labels.length > 0) && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {file.ai_category && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                        <Sparkles className="h-3 w-3" />
                        {file.ai_category}
                      </span>
                    )}
                    {labels.map((label) => (
                      <span key={label} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {label}
                      </span>
                    ))}
                  </div>
                )}

                {file.extraction_summary && (
                  <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{file.extraction_summary}</p>
                )}
                {tally && <p className="mt-2 text-[11px] font-medium text-muted-foreground">{tally}</p>}
                {file.status === 'failed' && file.processing_error && (
                  <p className="mt-3 text-xs text-rose-600">{file.processing_error}</p>
                )}

                <div className="mt-4 flex items-center gap-3 border-t pt-3 text-xs">
                  {counts.pending > 0 && file.source_message_id && (
                    <Link
                      href={`/events/${eventId}/chat?source=${file.source_message_id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      Review updates
                    </Link>
                  )}
                  {file.storage_path && (
                    <button
                      type="button"
                      onClick={() => openFile(file)}
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open file
                    </button>
                  )}
                  <span className="ml-auto text-muted-foreground" suppressHydrationWarning>
                    {formatBytes(file.size_bytes)} · {formatDistanceToNow(file.created_at)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
