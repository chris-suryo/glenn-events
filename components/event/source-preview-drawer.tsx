'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ReviewSource } from '@/lib/review'
import { Skeleton } from '@/components/ui/skeleton'
import { ExternalLink, FileText, Image as ImageIcon, X } from 'lucide-react'

interface SourcePreviewDrawerProps {
  source: ReviewSource
  onClose: () => void
}

type Loaded =
  | { kind: 'pdf'; url: string }
  | { kind: 'image'; url: string }
  | { kind: 'text'; text: string; url: string }
  | { kind: 'unsupported'; url: string }

function classify(mime: string | null): 'pdf' | 'image' | 'text' | 'unsupported' {
  if (!mime) return 'unsupported'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'text/plain' || mime === 'text/markdown' || mime.startsWith('text/')) return 'text'
  return 'unsupported'
}

export function SourcePreviewDrawer({ source, onClose }: SourcePreviewDrawerProps) {
  const supabase = createClient()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load(storagePath: string | null) {
      if (!storagePath) {
        setError('This source has no file to preview.')
        return
      }
      const { data, error: signErr } = await supabase.storage
        .from('event-files')
        .createSignedUrl(storagePath, 60)
      if (cancelled) return
      if (signErr || !data?.signedUrl) {
        setError('Could not load this file. Try opening it in a new tab.')
        return
      }
      const url = data.signedUrl
      const kind = classify(source.mimeType)
      if (kind === 'text') {
        try {
          const res = await fetch(url)
          const text = await res.text()
          if (!cancelled) setLoaded({ kind: 'text', text, url })
        } catch {
          if (!cancelled) setLoaded({ kind: 'unsupported', url })
        }
        return
      }
      if (kind === 'unsupported') {
        setLoaded({ kind: 'unsupported', url })
        return
      }
      setLoaded({ kind, url })
    }

    load(source.storagePath)
    return () => {
      cancelled = true
    }
  }, [source.storagePath, source.mimeType, supabase])

  const fileUrl = loaded?.url ?? null

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close source preview"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="flex min-w-0 items-start gap-2.5">
            {source.mimeType?.startsWith('image/') ? (
              <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Source</p>
              <p className="mt-0.5 truncate text-sm font-semibold">{source.fileName ?? source.label}</p>
            </div>
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

        <div className="flex-1 overflow-y-auto overscroll-contain bg-muted/20">
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : !loaded ? (
            <div className="flex flex-col gap-3 p-5">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : loaded.kind === 'pdf' ? (
            <iframe src={loaded.url} title={source.fileName ?? 'PDF preview'} className="h-full w-full border-0" />
          ) : loaded.kind === 'image' ? (
            <div className="flex h-full items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={loaded.url} alt={source.fileName ?? 'Source image'} className="mx-auto max-h-full max-w-full object-contain" />
            </div>
          ) : loaded.kind === 'text' ? (
            <pre className="whitespace-pre-wrap break-words p-5 text-xs leading-relaxed text-foreground">{loaded.text}</pre>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-muted-foreground">Preview isn&rsquo;t available for this file type.</p>
            </div>
          )}
        </div>

        {fileUrl ? (
          <div className="flex items-center justify-end border-t px-5 py-3">
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Open in new tab
            </a>
          </div>
        ) : null}
      </aside>
    </div>
  )
}
