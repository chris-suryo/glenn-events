'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { AiRun, Event, EventFile, Message, ProposedUpdate } from '@/lib/types'
import { GlennInput } from './glenn-input'
import { ProposedUpdatesQueue } from './proposed-updates-queue'
import { SourcePreviewDrawer } from './source-preview-drawer'
import { fileStatusLabel, fileToReviewSource, fileTypeLabel } from '@/lib/review'
import { formatDistanceToNow } from '@/lib/utils'
import { CheckCircle2, Eye, FileText, Image as ImageIcon, Paperclip } from 'lucide-react'

interface ExtractUpdatesResponse {
  assistant_message?: string
  grouped?: Record<string, unknown[] | undefined>
}

interface ChatViewProps {
  event: Event
  messages: Message[]
  pendingUpdates: ProposedUpdate[]
  aiRuns: AiRun[]
  files: EventFile[]
  highlightMessageId?: string | null
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
export function ChatView({ event, messages, pendingUpdates, aiRuns, files, highlightMessageId = null }: ChatViewProps) {
  const router = useRouter()
  const threadScrollRef = useRef<HTMLDivElement>(null)
  const reviewPanelRef = useRef<HTMLDivElement>(null)
  const reviewScrollRef = useRef<HTMLDivElement>(null)
  const prevMessageCountRef = useRef(messages.length)

  // Scroll ONLY the thread scroller. scrollIntoView is off-limits here: it also
  // scrolls overflow-hidden ancestors (the app shell), which have no scrollbars
  // to recover with — the layout ends up stranded with a blank area below.
  const scrollThreadToBottom = useCallback(() => {
    const el = threadScrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [])

  // Source-traceability highlight — when arriving via an "AI source" badge link
  const [activeHighlight, setActiveHighlight] = useState<string | null>(highlightMessageId)
  const skipAutoScrollRef = useRef(!!highlightMessageId)

  // File-channel messages render as attachment cards; map them to their library
  // file row (linked via source_message_id) so the same preview drawer opens.
  const [previewFile, setPreviewFile] = useState<EventFile | null>(null)
  const fileBySourceMessage = new Map<string, EventFile>()
  for (const f of files) {
    if (f.source_message_id) fileBySourceMessage.set(f.source_message_id, f)
  }

  useEffect(() => {
    if (!highlightMessageId) return
    const target = document.getElementById(`msg-${highlightMessageId}`)
    const scroller = threadScrollRef.current
    if (target && scroller) {
      const delta = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      const top = scroller.scrollTop + delta - (scroller.clientHeight - target.clientHeight) / 2
      scroller.scrollTo({ top, behavior: 'smooth' })
    }
    const timer = setTimeout(() => setActiveHighlight(null), 4000)
    return () => clearTimeout(timer)
  }, [highlightMessageId])

  // Streaming state
  const [isThinking, setIsThinking]       = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming]     = useState(false)

  // Optimistic user message — shown immediately on submit, cleared when DB refreshes
  const [optimisticMsg, setOptimisticMsg] = useState<string | null>(null)

  // Generation counter for the streaming animation. Bumping it cancels any
  // in-flight tick chain — without this, a router.refresh() that lands the
  // persisted assistant message mid-animation leaves the setTimeout loop
  // re-populating streamingText after the clear effect zeroed it, rendering
  // the same reply twice (persisted bubble + streaming overlay).
  const streamRunRef = useRef(0)

  // Scroll to bottom whenever new content arrives — skipped on first render
  // when a source-highlight link owns the initial scroll position
  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false
      return
    }
    scrollThreadToBottom()
  }, [messages.length, optimisticMsg, scrollThreadToBottom])

  // Clear streaming overlay + optimistic message when DB messages land —
  // and cancel any in-flight streaming animation so it can't re-populate.
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      streamRunRef.current++
      setStreamingText('')
      setIsStreaming(false)
      setOptimisticMsg(null)
    }
    prevMessageCountRef.current = messages.length
  }, [messages.length])

  // Keep scrolled to bottom while streaming text grows
  useEffect(() => {
    if (streamingText) {
      scrollThreadToBottom()
    }
  }, [streamingText, scrollThreadToBottom])

  // When a new extraction batch lands, surface it: groups render newest-first,
  // so jumping the review panel to the top shows the latest batch.
  const newestRunId = pendingUpdates.length > 0 ? pendingUpdates[pendingUpdates.length - 1].ai_run_id : null
  const prevNewestRunRef = useRef(newestRunId)
  useEffect(() => {
    if (newestRunId && newestRunId !== prevNewestRunRef.current) {
      reviewScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
    prevNewestRunRef.current = newestRunId
  }, [newestRunId])

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

    // Refresh deliberately waits until the animation finishes — refreshing
    // mid-stream lands the persisted reply alongside the overlay (duplicate
    // bubbles). The runId guard makes the loop cancellable either way.
    const runId = ++streamRunRef.current
    const words = text.split(' ')
    const delay = words.length > 80 ? 18 : STREAM_WORD_DELAY_MS
    let i = 0

    const tick = () => {
      if (streamRunRef.current !== runId) return
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

  const handleSubmitError = useCallback(() => {
    setOptimisticMsg(null)
    router.refresh()
  }, [router])

  const handleClarifyReviewItem = useCallback(async ({
    title,
    answer,
  }: {
    title: string
    answer: string
  }) => {
    const input = `Re: ${title} — ${answer}`
    setOptimisticMsg(input)
    setIsThinking(true)
    setStreamingText('')

    try {
      const res = await fetch(`/api/events/${event.id}/extract-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_text: input }),
      })

      const data = await res.json().catch(() => ({})) as ExtractUpdatesResponse & { error?: string }
      setIsThinking(false)

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to send clarification.')
      }

      const createdCount = Object.values(data.grouped ?? {}).reduce(
        (total, items) => total + (Array.isArray(items) ? items.length : 0),
        0
      )

      handleGlennReply(data.assistant_message ?? '')
      return { createdCount }
    } catch (err) {
      setIsThinking(false)
      setIsStreaming(false)
      throw err
    }
  }, [event.id, handleGlennReply])

  const hasContent = messages.length > 0 || !!optimisticMsg || isThinking || !!streamingText

  const welcomeDate = event.event_date
    ? new Date(`${event.event_date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : null
  const welcomeGreeting = `We're planning ${event.name}${welcomeDate ? ` on ${welcomeDate}` : ''}${event.location ? ` at ${event.location}` : ''}. I'll help keep the plan organized.`

  const completedSourceMsgIds = new Set(
    aiRuns
      .filter(r => r.status === 'completed' && r.source_message_id)
      .map(r => r.source_message_id as string)
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col lg:flex-row">

        {/* ── Left: message thread ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 border-r">

          {/* Scrollable area — iMessage-style: content anchors at the bottom.
              The inner flex-col has min-h-full so the flex-1 spacer fills
              empty space, pushing messages down. When messages overflow,
              the spacer shrinks and the overflow-y-auto parent scrolls. */}
          <div ref={threadScrollRef} className="flex-1 overflow-y-auto overscroll-contain min-h-0">
            <div className="flex flex-col min-h-full px-6 py-4">

              {/* Spacer — anchors content to the bottom like a chat thread */}
              <div className="flex-1" />

              {/* First-open welcome — presentational only; no messages row is created */}
              {!hasContent && (
                <div className="flex flex-col gap-1 items-start pb-2">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-3 bg-muted text-foreground text-sm leading-relaxed space-y-2">
                    <p suppressHydrationWarning>{welcomeGreeting}</p>
                    <p>Send me whatever you know, in any order:</p>
                    <ol className="list-decimal space-y-0.5 pl-4">
                      <li>Vendors &amp; food — who&rsquo;s providing what, and when do they arrive?</li>
                      <li>Costs — quotes, deposits, or a budget cap to track</li>
                      <li>Schedule — timing, arrivals, and deadlines</li>
                      <li>Still open — anything undecided or unknown</li>
                    </ol>
                    <p>Messy notes are fine — I&rsquo;ll turn the details into plan updates you can review before anything changes.</p>
                  </div>
                  <span className="text-xs text-muted-foreground px-1">Glenn</span>
                </div>
              )}

              {/* Messages */}
              {hasContent && (
                <div className="space-y-3">

                  {/* DB messages — with completed-review dividers */}
                  {(() => {
                    const items: React.ReactNode[] = []
                    let lastUserMsgId: string | null = null

                    for (const msg of messages) {
                      const attachedFile =
                        msg.role === 'user' && msg.channel === 'file'
                          ? fileBySourceMessage.get(msg.id) ?? null
                          : null
                      const isHighlighted = activeHighlight === msg.id
                      items.push(
                        <div
                          key={msg.id}
                          id={`msg-${msg.id}`}
                          className={`flex flex-col gap-1 ${msg.role === 'assistant' ? 'items-start' : 'items-end'}`}
                        >
                          {attachedFile ? (
                            <button
                              type="button"
                              onClick={() => setPreviewFile(attachedFile)}
                              className={`group flex max-w-[75%] items-center gap-2.5 rounded-2xl rounded-br-sm border bg-card px-3 py-2.5 text-left shadow-sm transition-shadow duration-700 hover:bg-muted/40 ${isHighlighted ? 'ring-2 ring-primary/60 shadow-[0_0_0_4px_rgba(99,102,241,0.12)]' : ''}`}
                            >
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                {attachedFile.mime_type?.startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium leading-tight text-foreground">
                                  {attachedFile.display_name || attachedFile.filename}
                                </span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  {fileTypeLabel(attachedFile.mime_type)} · {fileStatusLabel(attachedFile.status)}
                                </span>
                              </span>
                              <Eye className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                            </button>
                          ) : (
                          <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed transition-shadow duration-700 ${
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground rounded-br-sm'
                              : 'bg-muted text-foreground rounded-bl-sm'
                          } ${isHighlighted ? 'ring-2 ring-primary/60 shadow-[0_0_0_4px_rgba(99,102,241,0.12)]' : ''}`}>
                            {msg.role === 'assistant'
                              ? <GlennMessageContent text={msg.content} />
                              : msg.channel === 'file'
                                ? (
                                  <span className="flex items-start gap-1.5">
                                    <Paperclip className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" />
                                    <span className="whitespace-pre-line">{msg.content}</span>
                                  </span>
                                )
                                : msg.content
                            }
                          </div>
                          )}
                          {/* suppressHydrationWarning: relative time drifts between server render and hydration */}
                          <span className="text-xs text-muted-foreground px-1" suppressHydrationWarning>
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
                              All updates reviewed
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

            </div>
          </div>

          {/* Mobile-only jump to the review panel stacked below the thread */}
          {pendingUpdates.length > 0 && (
            <button
              type="button"
              onClick={() => reviewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
              className="lg:hidden flex items-center justify-center gap-1 border-t bg-primary/[0.04] py-2 text-xs font-medium text-primary"
            >
              {pendingUpdates.length} update{pendingUpdates.length !== 1 ? 's' : ''} to review ↓
            </button>
          )}

          {/* Input pinned at bottom */}
          <div className="border-t px-6 py-4 shrink-0">
            <GlennInput
              eventId={event.id}
              onUserMessage={handleUserMessage}
              onPendingChange={handlePendingChange}
              onGlennReply={handleGlennReply}
              onSubmitError={handleSubmitError}
              placeholder='What changed? Paste rough notes, emails, or updates for Glenn to review.'
              variant="plain"
            />
          </div>
        </div>

        {/* ── Right: review panel (stacks below the thread on mobile) ───────── */}
        <div ref={reviewPanelRef} className="w-full lg:w-[480px] xl:w-[560px] flex flex-col shrink-0 max-h-[45dvh] lg:max-h-none border-t lg:border-t-0">
          <div className="px-6 py-3 border-b shrink-0">
            <h3 className="text-sm font-semibold">
              Review
              {pendingUpdates.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs">
                  {pendingUpdates.length}
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review what Glenn found before it changes the plan.
            </p>
          </div>
          <div ref={reviewScrollRef} className="flex-1 overflow-y-auto overscroll-contain min-h-0">
            <ProposedUpdatesQueue
              updates={pendingUpdates}
              aiRuns={aiRuns}
              files={files}
              eventId={event.id}
              onClarify={handleClarifyReviewItem}
            />
          </div>
        </div>

      </div>

      {previewFile && (
        <SourcePreviewDrawer source={fileToReviewSource(previewFile)} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  )
}
