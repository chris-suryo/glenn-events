'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { ProvenanceDrawer } from './provenance-drawer'

interface AiSourceBadgeProps {
  eventId: string
  recordType: string
  recordId: string
}

// Opens the in-place provenance drawer: source message, Glenn's proposal,
// approval, and the record's history — without leaving the Plan.
export function AiSourceBadge({ eventId, recordType, recordId }: AiSourceBadgeProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-primary/30 hover:text-primary hover:bg-primary/[0.04] transition-colors"
        title="See where this came from"
      >
        <Sparkles className="h-2.5 w-2.5" />
        AI source
      </button>

      {open && (
        <ProvenanceDrawer
          eventId={eventId}
          recordType={recordType}
          recordId={recordId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
