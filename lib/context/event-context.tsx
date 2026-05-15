'use client'

import { createContext, useContext } from 'react'

interface EventContextValue {
  eventId: string
  eventName: string
}

const EventContext = createContext<EventContextValue | null>(null)

export function EventSidebarProvider({
  eventId,
  eventName,
  children,
}: EventContextValue & { children: React.ReactNode }) {
  return (
    <EventContext.Provider value={{ eventId, eventName }}>
      {children}
    </EventContext.Provider>
  )
}

export function useEventSidebar() {
  return useContext(EventContext)
}
