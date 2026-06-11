'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface GlennInputProps {
  eventId: string
  /** Called immediately when the user submits, with the raw text — before the API responds. */
  onUserMessage?: (text: string) => void
  /** Called when the user submits text — before the API responds. */
  onPendingChange?: (pending: boolean) => void
  /** Called with Glenn's reply text when the API responds successfully.
   *  When provided, the caller owns router.refresh(); GlennInput won't call it. */
  onGlennReply?: (text: string) => void
  /** Called when the submit request fails after the optimistic user message is shown. */
  onSubmitError?: () => void
  /** Overrides the randomized placeholder, e.g. for empty-event onboarding. */
  placeholder?: string
  variant?: 'default' | 'plain'
}

const PLACEHOLDERS = [
  'Tell Glenn what\'s going on… e.g. "Venue confirmed for Sep 27, deposit $4,500 due Jun 1. AV still unconfirmed."',
  'What changed since last time? e.g. "Headcount bumped to 90. Caterer quote came in at $12k — over budget."',
  'Dump your notes here… e.g. "Studio Lane confirmed for photos. Run of show needs to be locked by Aug 15."',
]

const CHIPS = [
  { label: 'Vendor update',   prompt: 'Vendor update: ' },
  { label: 'Budget change',   prompt: 'Budget update: ' },
  { label: 'New deadline',    prompt: 'New deadline: ' },
  { label: 'Risk or blocker', prompt: 'Risk: ' },
  { label: 'Decision made',   prompt: 'Decision: ' },
]

export function GlennInput({
  eventId,
  onUserMessage,
  onPendingChange,
  onGlennReply,
  onSubmitError,
  placeholder: placeholderOverride,
  variant = 'default',
}: GlennInputProps) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitInFlightRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [randomPlaceholder, setRandomPlaceholder] = useState(PLACEHOLDERS[0])
  useEffect(() => {
    // Intentional post-hydration randomization — avoids server/client mismatch
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRandomPlaceholder(PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)])
  }, [])
  const placeholder = placeholderOverride ?? randomPlaceholder

  async function submit() {
    if (!text.trim() || submitInFlightRef.current) return
    submitInFlightRef.current = true
    setIsSubmitting(true)

    const input = text.trim()
    setText('')
    onUserMessage?.(input)
    onPendingChange?.(true)

    try {
      const res = await fetch(`/api/events/${eventId}/extract-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_text: input }),
      })

      const data = await res.json()
      onPendingChange?.(false)

      if (!res.ok) {
        onSubmitError?.()
        toast.error(data.error ?? 'Something went wrong. Please try again.')
        return
      }

      if (onGlennReply) {
        // ChatView owns the refresh; deliver the reply for streaming
        onGlennReply(data.assistant_message ?? '')
      } else {
        // Standalone usage (Command Center) — route to Ask Glenn where the
        // reply and suggestions are visible. The /chat page loads fresh DB data.
        router.push(`/events/${eventId}/chat`)
      }
    } catch {
      onPendingChange?.(false)
      onSubmitError?.()
      toast.error('Network error. Please try again.')
    } finally {
      submitInFlightRef.current = false
      setIsSubmitting(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submit()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter without Shift sends the message
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function handleChip(prompt: string) {
    setText(prompt)
    textareaRef.current?.focus()
  }

  if (variant === 'plain') {
    return (
      <div className="rounded-xl border bg-card shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
        <form onSubmit={handleSubmit} className="p-3">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="min-h-[64px] resize-none border-0 bg-transparent p-0 text-sm leading-relaxed shadow-none focus-visible:ring-0"
            disabled={isSubmitting}
          />

          <div className="mt-2 flex items-center justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={!text.trim() || isSubmitting}
              suppressHydrationWarning
              className="shrink-0 shadow-[0px_0px_0px_1px_rgba(255,255,255,0.12)_inset]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Sending…
                </>
              ) : (
                'Tell Glenn'
              )}
            </Button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-card shadow-[0px_0px_0px_1px_rgba(0,0,0,0.04),0px_2px_6px_rgba(0,0,0,0.06)]">
      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary shadow-[0px_0px_0px_2px_rgba(255,255,255,0.9)_inset] shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="resize-none border-0 shadow-none focus-visible:ring-0 p-0 text-sm leading-relaxed min-h-[80px] bg-transparent"
            disabled={isSubmitting}
          />
        </div>

        {/* Example chips — only shown when textarea is empty */}
        {!text && (
          <div className="flex flex-wrap gap-1.5 pl-9">
            {CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                disabled={isSubmitting}
                onClick={() => handleChip(chip.prompt)}
                className="text-xs px-2.5 py-1 rounded-full border border-muted-foreground/20 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-40"
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pl-9">
          <p className="text-xs text-muted-foreground">
            Paste notes, emails, or updates — Glenn proposes plan changes for your review.{' '}
            <span className="opacity-60">Enter to send · Shift+Enter for newline</span>
          </p>
          <Button
            type="submit"
            size="sm"
            disabled={!text.trim() || isSubmitting}
            suppressHydrationWarning
            className="shrink-0 shadow-[0px_0px_0px_1px_rgba(255,255,255,0.12)_inset]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Sending…
              </>
            ) : (
              'Tell Glenn'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
