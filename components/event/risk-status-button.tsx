'use client'

import { useState, useTransition } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Risk } from '@/lib/types'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

const STATUS_LABELS: Record<Risk['status'], string> = {
  open:       'Open',
  monitoring: 'Monitoring',
  resolved:   'Resolved',
}

const STATUS_CLASSES: Record<Risk['status'], string> = {
  open:       'bg-slate-100 text-slate-500 hover:bg-slate-200',
  monitoring: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
  resolved:   'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
}

interface RiskStatusButtonProps {
  riskId: string
  eventId: string
  currentStatus: Risk['status']
}

export function RiskStatusButton({ riskId, eventId, currentStatus }: RiskStatusButtonProps) {
  const [optimisticStatus, setOptimisticStatus] = useState<Risk['status']>(currentStatus)
  const [, startTransition] = useTransition()

  function updateStatus(next: Risk['status']) {
    if (next === optimisticStatus) return
    const prev = optimisticStatus
    setOptimisticStatus(next)
    startTransition(async () => {
      const res = await fetch(`/api/events/${eventId}/risks/${riskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) setOptimisticStatus(prev)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize transition-colors cursor-default ${STATUS_CLASSES[optimisticStatus]}`}
        aria-label="Change risk status"
      >
        {STATUS_LABELS[optimisticStatus]}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end">
        {(Object.keys(STATUS_LABELS) as Risk['status'][]).map((s) => (
          <DropdownMenuItem
            key={s}
            onClick={() => updateStatus(s)}
            className={optimisticStatus === s ? 'font-semibold' : ''}
          >
            {STATUS_LABELS[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
