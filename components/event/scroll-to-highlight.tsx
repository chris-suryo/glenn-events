'use client'

import { useEffect } from 'react'

// Scrolls only the nearest scrollable ancestor. scrollIntoView is off-limits:
// it also scrolls overflow-hidden ancestors (the app shell), which have no
// scrollbars to recover with — the same stranded-layout bug fixed in chat-view.
export function ScrollToHighlight({ targetId }: { targetId: string | null }) {
  useEffect(() => {
    if (!targetId) return
    const target = document.getElementById(targetId)
    if (!target) return

    let scroller = target.parentElement
    while (scroller && scroller !== document.body) {
      const { overflowY } = getComputedStyle(scroller)
      if (overflowY === 'auto' || overflowY === 'scroll') break
      scroller = scroller.parentElement
    }
    if (!scroller || scroller === document.body) return

    const delta = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    const top = scroller.scrollTop + delta - (scroller.clientHeight - target.clientHeight) / 2
    scroller.scrollTo({ top, behavior: 'smooth' })
  }, [targetId])

  return null
}
