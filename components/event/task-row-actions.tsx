'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import type { Task } from '@/lib/types'

interface TaskRowActionsProps {
  taskId: string
  eventId: string
  currentStatus: Task['status']
}

export function TaskRowActions({ taskId, eventId, currentStatus }: TaskRowActionsProps) {
  const [optimisticStatus, setOptimisticStatus] = useState<Task['status']>(currentStatus)
  const [, startTransition] = useTransition()

  function toggle() {
    const next: Task['status'] = optimisticStatus === 'done' ? 'todo' : 'done'
    setOptimisticStatus(next)
    startTransition(async () => {
      const res = await fetch(`/api/events/${eventId}/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      // On failure, revert optimistic update
      if (!res.ok) setOptimisticStatus(currentStatus)
    })
  }

  return (
    <button
      onClick={toggle}
      className="mt-0.5 shrink-0 hover:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      aria-label={optimisticStatus === 'done' ? 'Mark as to-do' : 'Mark as done'}
    >
      {optimisticStatus === 'done'
        ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        : <Circle className="h-4 w-4 text-muted-foreground/40" />}
    </button>
  )
}

// Inline spinner for the static server render — used as a loading placeholder
export function TaskStatusIcon({ status }: { status: Task['status'] }) {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
  return <Circle className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0" />
}
