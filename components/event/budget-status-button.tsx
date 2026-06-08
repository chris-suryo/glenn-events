'use client'

import { useState, useTransition } from 'react'
import { ChevronDown } from 'lucide-react'
import type { BudgetItem } from '@/lib/types'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

const STATUS_LABELS: Record<BudgetItem['status'], string> = {
  estimated: 'Estimated',
  committed: 'Committed',
  paid:      'Paid',
}

const STATUS_CLASSES: Record<BudgetItem['status'], string> = {
  estimated: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  committed: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
  paid:      'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
}

interface BudgetStatusButtonProps {
  itemId: string
  eventId: string
  currentStatus: BudgetItem['status']
}

export function BudgetStatusButton({ itemId, eventId, currentStatus }: BudgetStatusButtonProps) {
  const [optimisticStatus, setOptimisticStatus] = useState<BudgetItem['status']>(currentStatus)
  const [, startTransition] = useTransition()

  function updateStatus(next: BudgetItem['status']) {
    if (next === optimisticStatus) return
    const prev = optimisticStatus
    setOptimisticStatus(next)
    startTransition(async () => {
      const res = await fetch(`/api/events/${eventId}/budget-items/${itemId}/status`, {
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
        aria-label="Change budget item status"
      >
        {STATUS_LABELS[optimisticStatus]}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end">
        {(Object.keys(STATUS_LABELS) as BudgetItem['status'][]).map((s) => (
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
