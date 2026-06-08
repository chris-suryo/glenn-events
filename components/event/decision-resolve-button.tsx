'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCheck, X, Loader2 } from 'lucide-react'

interface DecisionResolveButtonProps {
  decisionId: string
  eventId: string
}

export function DecisionResolveButton({ decisionId, eventId }: DecisionResolveButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleResolve() {
    if (!text.trim()) return
    startTransition(async () => {
      const res = await fetch(
        `/api/events/${eventId}/decisions/${decisionId}/resolve`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: text.trim() }),
        }
      )
      if (res.ok) {
        setOpen(false)
        setText('')
        router.refresh()
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
      >
        <CheckCheck className="h-3 w-3" />
        Resolve
      </button>
    )
  }

  return (
    <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Describe the decision made…"
        rows={2}
        className="w-full rounded-md border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        autoFocus
        disabled={isPending}
      />
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleResolve}
          disabled={!text.trim() || isPending}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
          Confirm
        </button>
        <button
          onClick={() => { setOpen(false); setText('') }}
          disabled={isPending}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
        >
          <X className="h-3 w-3" />
          Cancel
        </button>
      </div>
    </div>
  )
}
