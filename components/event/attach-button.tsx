'use client'

import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { Paperclip, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { uploadEventFile, UPLOAD_ACCEPT } from '@/lib/upload-file'
import { cn } from '@/lib/utils'

interface AttachButtonProps {
  eventId: string
  disabled?: boolean
  /** Optimistic: called with the filename as the upload starts. */
  onUploadStart: (filename: string) => void
  /** Called with Glenn's deterministic file reply when extraction completes. */
  onUploadReply: (reply: string) => void
  /** Called if upload/extraction fails (after onUploadStart). */
  onUploadError: () => void
}

/** Imperative handle so the composer can route a pasted screenshot through the
 *  same upload → extraction path as the paperclip. */
export interface AttachButtonHandle {
  uploadFile: (file: File) => void
}

export const AttachButton = forwardRef<AttachButtonHandle, AttachButtonProps>(function AttachButton(
  { eventId, disabled, onUploadStart, onUploadReply, onUploadError },
  ref,
) {
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function uploadOne(file: File) {
    setBusy(true)
    onUploadStart(file.name)
    const result = await uploadEventFile(file, eventId, supabase)
    setBusy(false)
    if (!result.ok) {
      onUploadError()
      toast.error(result.error ?? 'Upload failed')
      return
    }
    onUploadReply(result.assistant_message ?? '')
  }

  useImperativeHandle(ref, () => ({ uploadFile: (file: File) => void uploadOne(file) }))

  function handlePick(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    void uploadOne(file)
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="hidden"
        onChange={(e) => {
          handlePick(e.target.files)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        aria-label="Attach a file"
        title="Attach a PDF, image, or text file"
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors',
          'hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent',
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
      </button>
    </>
  )
})
