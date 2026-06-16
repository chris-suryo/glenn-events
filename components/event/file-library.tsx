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
import type { Event, EventFile, FileStatus } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { cn, formatDistanceToNow } from '@/lib/utils'

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain',
  md: 'text/markdown',
}
const ALLOWED_MIME = new Set(Object.values(EXT_MIME))
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.txt,.md,application/pdf,image/png,image/jpeg,text/plain,text/markdown'

const STATUS_PILL: Record<FileStatus, { label: string; className: string; spin?: boolean }> = {
  uploaded:     { label: 'Uploaded',         className: 'bg-muted text-muted-foreground' },
  extracting:   { label: 'Reading…',         className: 'bg-amber-500/10 text-amber-600', spin: true },
  needs_review: { label: 'Ready for review', className: 'bg-indigo-500/10 text-indigo-600' },
  extracted:    { label: 'No updates',       className: 'bg-muted text-muted-foreground' },
  source_only:  { label: 'Source only',      className: 'bg-muted text-muted-foreground' },
  failed:       { label: 'Failed',           className: 'bg-rose-500/10 text-rose-600' },
}

interface PendingUpload {
  id: string
  name: string
  phase: 'uploading' | 'reading' | 'error'
  error?: string
}

function resolveMime(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (file.type && ALLOWED_MIME.has(file.type)) return file.type
  return EXT_MIME[ext] ?? file.type ?? ''
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
  initialFiles,
}: {
  event: Event
  eventId: string
  initialFiles: EventFile[]
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
      const mime = resolveMime(file)

      if (!ALLOWED_MIME.has(mime)) {
        setPending((p) => [...p, { id: localId, name: file.name, phase: 'error', error: 'Unsupported file type' }])
        return
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setPending((p) => [...p, { id: localId, name: file.name, phase: 'error', error: 'File is larger than 10 MB' }])
        return
      }

      setPending((p) => [...p, { id: localId, name: file.name, phase: 'uploading' }])
      try {
        const fileId = crypto.randomUUID()
        const ext = file.name.split('.').pop()?.toLowerCase()
        const path = `${eventId}/${fileId}${ext ? `.${ext}` : ''}`

        const { error: upErr } = await supabase.storage
          .from('event-files')
          .upload(path, file, { contentType: mime, upsert: false })
        if (upErr) throw new Error(upErr.message)

        setPending((p) => p.map((x) => (x.id === localId ? { ...x, phase: 'reading' } : x)))

        const res = await fetch(`/api/events/${eventId}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_id: fileId,
            filename: file.name,
            storage_path: path,
            mime_type: mime,
            size_bytes: file.size,
          }),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error ?? 'Upload failed')
        }
        setPending((p) => p.filter((x) => x.id !== localId))
      } catch (err) {
        setPending((p) =>
          p.map((x) =>
            x.id === localId ? { ...x, phase: 'error', error: err instanceof Error ? err.message : 'Upload failed' } : x,
          ),
        )
      }
    },
    [eventId, supabase],
  )

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      setBusy(true)
      // Sequential — extraction is an LLM call per file; avoids rate spikes.
      for (const file of Array.from(files)) {
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

  const hasFiles = initialFiles.length > 0 || pending.length > 0

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
          accept={ACCEPT}
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
      {initialFiles.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {initialFiles.map((file) => {
            const pill = STATUS_PILL[file.status]
            const title = file.ai_suggested_name || file.display_name || file.filename
            const labels = Array.isArray(file.ai_labels) ? file.ai_labels : []
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
                {file.status === 'failed' && file.processing_error && (
                  <p className="mt-3 text-xs text-rose-600">{file.processing_error}</p>
                )}

                <div className="mt-4 flex items-center gap-3 border-t pt-3 text-xs">
                  {file.status === 'needs_review' && file.source_message_id && (
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
