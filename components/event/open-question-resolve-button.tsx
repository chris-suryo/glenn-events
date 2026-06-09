'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCheck, Loader2 } from 'lucide-react'

interface OpenQuestionResolveButtonProps {
  questionId: string
  eventId: string
}

export function OpenQuestionResolveButton({ questionId, eventId }: OpenQuestionResolveButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)
  const [answer, setAnswer] = useState('')
  const [done, setDone] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleOpen() {
    setIsOpen(true)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  function handleSave() {
    startTransition(async () => {
      const res = await fetch(
        `/api/events/${eventId}/open-questions/${questionId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'answered',
            ...(answer.trim() ? { answer: answer.trim() } : {}),
          }),
        }
      )
      if (res.ok) {
        setDone(true)
        router.refresh()
      }
    })
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700">
        <CheckCheck className="h-3 w-3" />
        Answered
      </span>
    )
  }

  if (!isOpen) {
    return (
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
      >
        <CheckCheck className="h-3 w-3" />
        Answer
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <textarea
        ref={textareaRef}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Type the answer… (optional — can leave blank to just mark as answered)"
        rows={2}
        className="w-full rounded-md border bg-background px-3 py-2 text-xs leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60"
        disabled={isPending}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CheckCheck className="h-3 w-3" />
          )}
          Save answer
        </button>
        <button
          onClick={() => { setIsOpen(false); setAnswer('') }}
          disabled={isPending}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// Spinner shown during isPending transition
export function OpenQuestionPendingSpinner() {
  return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
}
