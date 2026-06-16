'use client'

import { useRef } from 'react'
import { Paperclip } from 'lucide-react'
import { UPLOAD_ACCEPT } from '@/lib/upload-file'
import { cn } from '@/lib/utils'

interface AttachButtonProps {
  disabled?: boolean
  /** Hands picked files to the composer to STAGE — nothing uploads here. */
  onFilesSelected: (files: File[]) => void
}

// Pure file picker. Staging + upload-on-send live in the composer (glenn-input).
export function AttachButton({ disabled, onFilesSelected }: AttachButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFilesSelected(Array.from(e.target.files))
          e.target.value = ''
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        aria-label="Attach a file"
        title="Attach a PDF, image, or text file"
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors',
          'hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent',
        )}
      >
        <Paperclip className="h-4 w-4" />
      </button>
    </>
  )
}
