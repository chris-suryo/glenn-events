'use client'

import { useEffect } from 'react'

export function ScrollToHighlight({ targetId }: { targetId: string | null }) {
  useEffect(() => {
    if (!targetId) return
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [targetId])

  return null
}
