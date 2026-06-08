'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCheck, Loader2 } from 'lucide-react'

interface OpenQuestionResolveButtonProps {
  questionId: string
  eventId: string
}

export function OpenQuestionResolveButton({ questionId, eventId }: OpenQuestionResolveButtonProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [done, setDone] = useState(false)

  function handleResolve() {
    startTransition(async () => {
      const res = await fetch(
        `/api/events/${eventId}/open-questions/${questionId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'answered' }),
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

  return (
    <button
      onClick={handleResolve}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
    >
      <CheckCheck className="h-3 w-3" />
      Mark answered
    </button>
  )
}

// Spinner shown during isPending transition — not used externally but kept for consistency
export function OpenQuestionPendingSpinner() {
  return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
}
