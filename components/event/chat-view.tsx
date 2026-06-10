'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { AiRun, Event, Message, ProposedUpdate } from '@/lib/types'
import { GlennInput } from './glenn-input'
import { ProposedUpdatesQueue } from './proposed-updates-queue'
import { formatDistanceToNow } from '@/lib/utils'
import { CheckCircle2, Sparkles } from 'lucide-react'

interface ChatViewProps {
  event: Event
  messages: Message[]
  pendingUpdates: ProposedUpdate[]
  aiRuns: AiRun[]
}

// ── Markdown helpers ────────────────────────────────────────────────────────────

/** Renders **bold**, *italic*, and `code` inline spans. */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
        if (part.startsWith('*') && part.endsWith('*'))
          return <em key={i}>{part.slice(1, -1)}</em>
        if (part.startsWith('`') && part.endsWith('`'))
          return <code key={i} className="rounded bg-foreground/10 px-1 py-px text-[0.8em] font-mono">{part.slice(1, -1)}</code>
        return <React.Fragment key={i}>{part}</React.Fragment>
      })}
    </>
  )
}

/** Renders a Glenn message with block-level markdown: paragraphs, bullet lists, numbered lists. */
function GlennMessageContent({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/)

  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter((l) => l.trim())

        // Unordered list — every line starts with - * or •
        if (lines.length > 0 && lines.every((l) => /^[-*•]\s+\S/.test(l.trim()))) {
          return (
            <ul key={bi} className="list-disc space-y-0.5 pl-4">
              {lines.map((l, li) => (
                <li key={li}>{renderInline(l.trim().replace(/^[-*•]\s+/, ''))}</li>
              ))}
            </ul>
          )
        }

        // Ordered list — every line starts with 1. or 1)
        if (lines.length > 0 && lines.every((l) => /^\d+[.)]\s+\S/.test(l.trim()))) {
          return (
            <ol key={bi} className="list-decimal space-y-0.5 pl-4">
              {lines.map((l, li) => (
                <li key={li}>{renderInline(l.trim().replace(/^\d+[.)]\s+/, ''))}</li>
              ))}
            </ol>
          )
        }

        // Regular paragraph — join single newlines as line breaks
        return (
          <p key={bi}>
            {lines.map((line, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(line)}
              </React.Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}

// ── Streaming speed ─────────────────────────────────────────────────────────────
const STREAM_WORD_DELAY_MS = 30

// ── Component ───────────────────────────────────────────────────────────────────
export function ChatView({ event, messages, pendingUpdates, aiRuns }: ChatViewProps) {
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevMessageCountRef = useRef(messages.length)

  // Streaming state
  const [isThinking, setIsThinking]       = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming]     = useState(false)

  // Optimistic user message — shown immediately on submit, cleared when DB refreshes
  const [optimisticMsg, setOptimisticMsg] = useState<string | null>(null)

  // Scroll to bottom whenever new content arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, optimisticMsg])

  // Clear streaming overlay + optimistic message when DB messages land
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      setStreamingText('')
      setIsStreaming(false)
      setOptimisticMsg(null)
    }
    prevMessageCountRef.current = messages.length
  }, [messages.length])

  // Keep scrolled to bottom while streaming text grows
  useEffect(() => {
    if (streamingText) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [streamingText])

  // ── Callbacks for GlennInput ────────────────────────────────────────────────
  const handleUserMessage = useCallback((text: string) => {
    setOptimisticMsg(text)
  }, [])

  const handlePendingChange = useCallback((pending: boolean) => {
    if (pending) {
      setIsThinking(true)
      setStreamingText('')
    } else {
      setIsThinking(false)
    }
  }, [])

  const handleGlennReply = useCallback((text: string) => {
    if (!text) {
      router.refresh()
      return
    }
    setIsThinking(false)
    setIsStreaming(true)
    setStreamingText('')

    const words = text.split(' ')
    const delay = words.length > 80 ? 18 : STREAM_WORD_DELAY_MS
    let i = 0

    const tick = () => {
      i++
      setStreamingText(words.slice(0, i).join(' '))
      if (i < words.length) {
        setTimeout(tick, delay)
      } else {
        setIsStreaming(false)
        setTimeout(() => router.refresh(), 400)
      }
    }
    setTimeout(tick, delay)
  }, [router])

  const hasContent = messages.length > 0 || !!optimisticMsg || isThinking || !!streamingText

  const completedSourceMsgIds = new Set(
    aiRuns
      .filter(r => r.status === 'completed' && r.source_message_id)
      .map(r => r.source_message_id as string)
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">

        {/* ── Left: message thread ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 border-r">

          {/* Scrollable area — iMessage-style: content anchors at the bottom.
              The inner flex-col has min-h-full so the flex-1 spacer fills
              empty space, pushing messages down. When messages overflow,
              the spacer shrinks and the overflow-y-auto parent scrolls. */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="flex flex-col min-h-full px-6 py-4">

              {/* Spacer + empty state */}
              <div className="flex-1 flex flex-col items-center justify-center py-6">
                {!hasContent && (
                  <div className="flex flex-col items-center gap-3 text-center max-w-xs">
                    <Sparkles className="h-8 w-8 text-primary/30" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Tell Glenn what changed</p>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        Paste notes, emails, or updates — Glenn proposes structured plan changes for you to review before anything is saved.
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground/60 italic">
                      e.g. &ldquo;Venue confirmed for Sep 27, deposit $4,500 due Jun 1. AV still unconfirmed.&rdquo;
                    </p>
                  </div>
                )}
              </div>

              {/* Messages */}
              {hasContent && (
                <div className="space-y-3">

                  {/* DB messages — with completed-review dividers */}
                  {(() => {
                    const items: React.ReactNode[] = []
                    let lastUserMsgId: string | null = null

                    for (const msg of messages) {
                      items.push(
                        <div
                          key={msg.id}
                          className={`flex flex-col gap-1 ${msg.role === 'assistant' ? 'items-start' : 'items-end'}`}
                        >
                          <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground rounded-br-sm'
                              : 'bg-muted text-foreground rounded-bl-sm'
                          }`}>
                            {msg.role === 'assistant'
                              ? <GlennMessageContent text={msg.content} />
                              : msg.content
                            }
                          </div>
                          <span className="text-xs text-muted-foreground px-1">
                            {msg.role === 'assistant' ? 'Glenn · ' : ''}
                            {formatDistanceToNow(msg.created_at)}
                          </span>
                        </div>
                      )

                      if (msg.role === 'user') {
                        lastUserMsgId = msg.id
                      } else if (msg.role === 'assistant' && lastUserMsgId && completedSourceMsgIds.has(lastUserMsgId)) {
                        items.push(
                          <div key={`divider-${msg.id}`} className="flex items-center gap-3 py-2">
                            <div className="h-px flex-1 bg-emerald-500/20" />
                            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600/70">
                              <CheckCircle2 className="size-3" />
                              All suggestions reviewed
                            </span>
                            <div className="h-px flex-1 bg-emerald-500/20" />
                          </div>
                        )
                        lastUserMsgId = null
                      }
                    }

                    return items
                  })()}

                  {/* Optimistic user message — shows instantly on submit */}
                  {optimisticMsg && (
                    <div className="flex flex-col gap-1 items-end">
                      <div className="max-w-[75%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed bg-primary text-primary-foreground">
                        {optimisticMsg}
                      </div>
                      <span className="text-xs text-muted-foreground px-1">just now</span>
                    </div>
                  )}

                  {/* Glenn is thinking… */}
                  {isThinking && (
                    <div className="flex flex-col gap-1 items-start">
                      <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-muted flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-xs text-muted-foreground px-1">Glenn</span>
                    </div>
                  )}

                  {/* Streaming overlay — word-by-word reveal (plain text while animating) */}
                  {streamingText && (
                    <div className="flex flex-col gap-1 items-start">
                      <div className="max-w-[75%] rounded-2xl rounded-bl-sm px-4 py-2.5 bg-muted text-foreground text-sm leading-relaxed">
                        {streamingText}
                        {isStreaming && (
                          <span className="inline-block w-0.5 h-3.5 bg-foreground/50 ml-0.5 align-text-bottom animate-pulse" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground px-1">Glenn · just now</span>
                    </div>
                  )}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input pinned at bottom */}
          <div className="border-t px-6 py-4 shrink-0">
            <GlennInput
              eventId={event.id}
              onUserMessage={handleUserMessage}
              onPendingChange={handlePendingChange}
              onGlennReply={handleGlennReply}
            />
          </div>
        </div>

        {/* ── Right: Glenn's suggestions ────────────────────────────────────── */}
        <div className="w-full lg:w-96 flex flex-col shrink-0">
          <div className="px-6 py-3 border-b shrink-0">
            <h3 className="text-sm font-semibold">
              Glenn&apos;s suggestions
              {pendingUpdates.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs">
                  {pendingUpdates.length}
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Apply adds to plan · Dismiss leaves it unchanged
            </p>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <ProposedUpdatesQueue updates={pendingUpdates} aiRuns={aiRuns} eventId={event.id} />
          </div>
        </div>

      </div>
    </div>
  )
}
