'use client'

import { useState, useTransition } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Vendor } from '@/lib/types'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

const STATUS_LABELS: Record<Vendor['status'], string> = {
  prospect:  'Prospect',
  contacted: 'Contacted',
  confirmed: 'Confirmed',
  declined:  'Declined',
}

const STATUS_CLASSES: Record<Vendor['status'], string> = {
  confirmed: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  contacted: 'bg-sky-50 text-sky-700 hover:bg-sky-100',
  prospect:  'bg-slate-100 text-slate-600 hover:bg-slate-200',
  declined:  'bg-rose-50 text-rose-700 hover:bg-rose-100',
}

interface VendorStatusButtonProps {
  vendorId: string
  eventId: string
  currentStatus: Vendor['status']
}

export function VendorStatusButton({ vendorId, eventId, currentStatus }: VendorStatusButtonProps) {
  const [optimisticStatus, setOptimisticStatus] = useState<Vendor['status']>(currentStatus)
  const [, startTransition] = useTransition()

  function updateStatus(next: Vendor['status']) {
    if (next === optimisticStatus) return
    const prev = optimisticStatus
    setOptimisticStatus(next)
    startTransition(async () => {
      const res = await fetch(`/api/events/${eventId}/vendors/${vendorId}/status`, {
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
        aria-label="Change vendor status"
      >
        {STATUS_LABELS[optimisticStatus]}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end">
        {(Object.keys(STATUS_LABELS) as Vendor['status'][]).map((s) => (
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
