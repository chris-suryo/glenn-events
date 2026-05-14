'use client'

import type { Event, Message, ProposedUpdate } from '@/lib/types'
import { GlennInput } from './glenn-input'
import { ProposedUpdatesQueue } from './proposed-updates-queue'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatDistanceToNow } from '@/lib/utils'
import { MessageCircle } from 'lucide-react'

interface ChatViewProps {
  event: Event
  messages: Message[]
  pendingUpdates: ProposedUpdate[]
}

export function ChatView({ event, messages, pendingUpdates }: ChatViewProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 shrink-0">
        <h2 className="text-sm font-semibold">Chat &amp; Updates</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Input history and Glenn&apos;s proposed updates
        </p>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-0">
        {/* Message history */}
        <div className="flex-1 flex flex-col min-h-0 border-r">
          <div className="px-6 py-3 border-b">
            <GlennInput eventId={event.id} />
          </div>
          <ScrollArea className="flex-1">
            <div className="px-6 py-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                  <MessageCircle className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No messages yet.<br />Use the input above to tell Glenn what&apos;s going on.</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`flex flex-col gap-1 ${msg.role === 'assistant' ? 'items-start' : 'items-end'}`}>
                    <div className={`max-w-xl rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}>
                      {msg.content}
                    </div>
                    <span className="text-xs text-muted-foreground px-1">
                      {msg.role === 'assistant' ? 'Glenn · ' : ''}{formatDistanceToNow(msg.created_at)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Proposed updates */}
        <div className="w-full lg:w-96 flex flex-col shrink-0">
          <div className="px-6 py-3 border-b">
            <h3 className="text-sm font-semibold">
              Proposed updates
              {pendingUpdates.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs">
                  {pendingUpdates.length}
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Review before applying</p>
          </div>
          <ScrollArea className="flex-1">
            <ProposedUpdatesQueue updates={pendingUpdates} eventId={event.id} />
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
