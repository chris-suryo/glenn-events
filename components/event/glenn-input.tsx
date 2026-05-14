'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface GlennInputProps {
  eventId: string
}

const PLACEHOLDERS = [
  'Tell Glenn what changed… e.g. "Venue confirmed for Sep 27, deposit $4,500 due by Jun 1. AV vendor still not confirmed — follow up this week."',
  'Tell Glenn what changed… e.g. "Headcount updated to 90. Caterer quote came in at $12k which is over budget."',
  'Tell Glenn what changed… e.g. "Photography confirmed with Studio Lane. Need to finalize run of show by Aug 15."',
]

export function GlennInput({ eventId }: GlennInputProps) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [isPending, startTransition] = useTransition()
  const placeholder = PLACEHOLDERS[0]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return

    startTransition(async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/extract-updates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input_text: text.trim() }),
        })

        const data = await res.json()

        if (!res.ok) {
          toast.error(data.error ?? 'Something went wrong. Please try again.')
          return
        }

        const totalCount = Object.values(data.grouped ?? {}).reduce(
          (sum: number, arr) => sum + (arr as unknown[]).length,
          0
        )

        toast.success(
          totalCount > 0
            ? `Glenn found ${totalCount} proposed update${totalCount !== 1 ? 's' : ''}. Review before applying.`
            : 'Glenn processed your update. No new items were extracted.'
        )

        setText('')
        router.refresh()
      } catch {
        toast.error('Network error. Please try again.')
      }
    })
  }

  return (
    <Card className="border-2 border-primary/20 bg-background shadow-sm">
      <CardContent className="pt-4 pb-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary shrink-0">
              <Sparkles className="h-3 w-3 text-primary-foreground" />
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={placeholder}
              className="resize-none border-0 shadow-none focus-visible:ring-0 p-0 text-sm leading-relaxed min-h-[72px]"
              disabled={isPending}
            />
          </div>
          <div className="flex items-center justify-between pl-7">
            <p className="text-xs text-muted-foreground">
              Dump messy notes, emails, or updates — Glenn will extract the structure.
            </p>
            <Button
              type="submit"
              size="sm"
              disabled={!text.trim() || isPending}
              className="shrink-0"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Processing…
                </>
              ) : (
                'Tell Glenn'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
