'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2, X, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { uploadEventFile, resolveMime, ALLOWED_MIME, MAX_FILE_SIZE_BYTES } from '@/lib/upload-file'
import { AttachButton } from './attach-button'

interface GlennInputProps {
  eventId: string
  /** Called immediately when the user submits, with the raw text — before the API responds. */
  onUserMessage?: (text: string) => void
  /** Called when the user submits text — before the API responds. */
  onPendingChange?: (pending: boolean) => void
  /** Called with Glenn's reply text when the API responds successfully.
   *  When provided, the caller owns router.refresh(); GlennInput won't call it. */
  onGlennReply?: (text: string) => void
  /** Called when the submit request fails after the optimistic user message is shown. */
  onSubmitError?: () => void
  /** Overrides the randomized placeholder, e.g. for empty-event onboarding. */
  placeholder?: string
  variant?: 'default' | 'plain'
}

// A file staged in the composer but not yet uploaded. Upload happens on send.
interface PendingAttachment {
  id: string
  file: File
  name: string
  type: string
  size: number
  /** Object URL for image preview; undefined for non-image files. */
  url?: string
}

const PLACEHOLDERS = [
  'Tell Glenn what\'s going on… e.g. "Venue confirmed for Sep 27, deposit $4,500 due Jun 1. AV still unconfirmed."',
  'What changed since last time? e.g. "Headcount bumped to 90. Caterer quote came in at $12k — over budget."',
  'Dump your notes here… e.g. "Studio Lane confirmed for photos. Run of show needs to be locked by Aug 15."',
]

const CHIPS = [
  { label: 'Vendor update',   prompt: 'Vendor update: ' },
  { label: 'Budget change',   prompt: 'Budget update: ' },
  { label: 'New deadline',    prompt: 'New deadline: ' },
  { label: 'Risk or blocker', prompt: 'Risk: ' },
  { label: 'Decision made',   prompt: 'Decision: ' },
]

function typeLabel(mime: string): string {
  if (mime === 'application/pdf') return 'PDF'
  if (mime === 'text/markdown') return 'MD'
  if (mime === 'text/plain') return 'TXT'
  if (mime === 'image/png') return 'PNG'
  if (mime === 'image/jpeg') return 'JPG'
  return 'FILE'
}

function PendingAttachmentList({
  items,
  disabled,
  onRemove,
}: {
  items: PendingAttachment[]
  disabled: boolean
  onRemove: (id: string) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((att) =>
        att.url ? (
          <div key={att.id} className="relative h-16 w-16 overflow-hidden rounded-md border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={att.url} alt={att.name} className="h-full w-full object-cover" />
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(att.id)}
              aria-label={`Remove ${att.name}`}
              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition-colors hover:text-foreground disabled:opacity-40"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div key={att.id} className="flex items-center gap-2 rounded-md border bg-muted/40 py-1.5 pl-2 pr-1.5">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="max-w-[140px] truncate text-xs font-medium leading-tight">{att.name}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{typeLabel(att.type)}</p>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(att.id)}
              aria-label={`Remove ${att.name}`}
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
      )}
    </div>
  )
}

export function GlennInput({
  eventId,
  onUserMessage,
  onPendingChange,
  onGlennReply,
  onSubmitError,
  placeholder: placeholderOverride,
  variant = 'default',
}: GlennInputProps) {
  const router = useRouter()
  const supabase = createClient()
  const [text, setText] = useState('')
  const [pending, setPending] = useState<PendingAttachment[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitInFlightRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingRef = useRef<PendingAttachment[]>([])
  const [randomPlaceholder, setRandomPlaceholder] = useState(PLACEHOLDERS[0])
  useEffect(() => {
    // Intentional post-hydration randomization — avoids server/client mismatch
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRandomPlaceholder(PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)])
  }, [])
  const placeholder = placeholderOverride ?? randomPlaceholder

  // Mirror pending into a ref so the unmount cleanup can revoke object URLs.
  useEffect(() => {
    pendingRef.current = pending
  }, [pending])
  useEffect(() => {
    return () => {
      for (const att of pendingRef.current) if (att.url) URL.revokeObjectURL(att.url)
    }
  }, [])

  const canSend = (!!text.trim() || pending.length > 0) && !isSubmitting

  // Stage files locally — validate up front, nothing uploads until send.
  function addFiles(files: File[]) {
    const staged: PendingAttachment[] = []
    for (const file of files) {
      const mime = resolveMime(file)
      if (!ALLOWED_MIME.has(mime)) {
        toast.error(`${file.name}: unsupported file type`)
        continue
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast.error(`${file.name}: larger than 10 MB`)
        continue
      }
      staged.push({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        type: mime,
        size: file.size,
        url: mime.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      })
    }
    if (staged.length > 0) setPending((cur) => [...cur, ...staged])
  }

  function removeAttachment(id: string) {
    setPending((cur) => {
      const found = cur.find((p) => p.id === id)
      if (found?.url) URL.revokeObjectURL(found.url)
      return cur.filter((p) => p.id !== id)
    })
  }

  // Text extraction (existing path). Returns whether it succeeded; never routes
  // itself — submit() routes once at the end for the standalone composer.
  async function runText(input: string): Promise<boolean> {
    onUserMessage?.(input)
    onPendingChange?.(true)
    try {
      const res = await fetch(`/api/events/${eventId}/extract-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_text: input }),
      })
      const data = await res.json()
      onPendingChange?.(false)
      if (!res.ok) {
        onSubmitError?.()
        toast.error(data.error ?? 'Something went wrong. Please try again.')
        return false
      }
      onGlennReply?.(data.assistant_message ?? '')
      return true
    } catch {
      onPendingChange?.(false)
      onSubmitError?.()
      toast.error('Network error. Please try again.')
      return false
    }
  }

  // Upload each staged attachment through the existing uploadEventFile path.
  // Returns the attachments that failed (kept staged so the user can retry).
  async function runUploads(items: PendingAttachment[]): Promise<PendingAttachment[]> {
    const failed: PendingAttachment[] = []
    for (const att of items) {
      onUserMessage?.(`Uploading "${att.name}"…`)
      onPendingChange?.(true)
      const result = await uploadEventFile(att.file, eventId, supabase)
      onPendingChange?.(false)
      if (!result.ok) {
        failed.push(att)
        onSubmitError?.()
        toast.error(`${att.name}: ${result.error ?? 'upload failed'}`)
        continue
      }
      if (att.url) URL.revokeObjectURL(att.url)
      onGlennReply?.(result.assistant_message ?? '')
    }
    return failed
  }

  async function submit() {
    if (submitInFlightRef.current) return
    const input = text.trim()
    const attachments = pending
    if (!input && attachments.length === 0) return

    submitInFlightRef.current = true
    setIsSubmitting(true)
    let didWork = false
    try {
      if (input) {
        setText('')
        const ok = await runText(input)
        didWork = didWork || ok
      }
      if (attachments.length > 0) {
        const failed = await runUploads(attachments)
        setPending(failed)
        didWork = didWork || failed.length < attachments.length
      }
    } finally {
      submitInFlightRef.current = false
      setIsSubmitting(false)
    }

    // Standalone composer (Command Center): route to Ask Glenn once, where the
    // reply and suggestions are visible. ChatView passes onGlennReply and stays.
    if (!onGlennReply && didWork) router.push(`/events/${eventId}/chat`)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submit()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter without Shift sends the message (and any staged attachments)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function handleChip(prompt: string) {
    setText(prompt)
    textareaRef.current?.focus()
  }

  // Paste a screenshot → STAGE it as a pending attachment (no auto-upload).
  // Only intercept image blobs; leave text paste alone.
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (isSubmitting) return
    const imageItems = Array.from(e.clipboardData.items).filter(
      (item) => item.kind === 'file' && item.type.startsWith('image/'),
    )
    if (imageItems.length === 0) return
    e.preventDefault()
    const files: File[] = []
    for (const item of imageItems) {
      const blob = item.getAsFile()
      if (!blob) continue
      const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png'
      files.push(
        new File([blob], blob.name || `pasted-screenshot-${Date.now()}-${files.length}.${ext}`, { type: blob.type }),
      )
    }
    if (files.length > 0) addFiles(files)
  }

  if (variant === 'plain') {
    return (
      <div className="rounded-xl border bg-card shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
        <form onSubmit={handleSubmit} className="p-3">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            className="min-h-[64px] resize-none border-0 bg-transparent p-0 text-sm leading-relaxed shadow-none focus-visible:ring-0"
            disabled={isSubmitting}
          />

          {pending.length > 0 && (
            <div className="mt-2">
              <PendingAttachmentList items={pending} disabled={isSubmitting} onRemove={removeAttachment} />
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <AttachButton disabled={isSubmitting} onFilesSelected={addFiles} />
            <Button
              type="submit"
              size="sm"
              disabled={!canSend}
              suppressHydrationWarning
              className="shrink-0 shadow-[0px_0px_0px_1px_rgba(255,255,255,0.12)_inset]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Sending…
                </>
              ) : (
                'Tell Glenn'
              )}
            </Button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-card shadow-[0px_0px_0px_1px_rgba(0,0,0,0.04),0px_2px_6px_rgba(0,0,0,0.06)]">
      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary shadow-[0px_0px_0px_2px_rgba(255,255,255,0.9)_inset] shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            className="resize-none border-0 shadow-none focus-visible:ring-0 p-0 text-sm leading-relaxed min-h-[80px] bg-transparent"
            disabled={isSubmitting}
          />
        </div>

        {pending.length > 0 && (
          <div className="pl-9">
            <PendingAttachmentList items={pending} disabled={isSubmitting} onRemove={removeAttachment} />
          </div>
        )}

        {/* Example chips — only shown when textarea is empty and nothing staged */}
        {!text && pending.length === 0 && (
          <div className="flex flex-wrap gap-1.5 pl-9">
            {CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                disabled={isSubmitting}
                onClick={() => handleChip(chip.prompt)}
                className="text-xs px-2.5 py-1 rounded-full border border-muted-foreground/20 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-40"
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pl-9">
          <p className="text-xs text-muted-foreground">
            Paste notes, emails, or updates — or attach a file. Glenn proposes plan changes for your review.{' '}
            <span className="opacity-60">Enter to send · Shift+Enter for newline</span>
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            <AttachButton disabled={isSubmitting} onFilesSelected={addFiles} />
            <Button
              type="submit"
              size="sm"
              disabled={!canSend}
              suppressHydrationWarning
              className="shrink-0 shadow-[0px_0px_0px_1px_rgba(255,255,255,0.12)_inset]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Sending…
                </>
              ) : (
                'Tell Glenn'
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
