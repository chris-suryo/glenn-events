import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { OpenQuestion } from '@/lib/types'
import { HelpCircle } from 'lucide-react'
import { OpenQuestionResolveButton } from '@/components/event/open-question-resolve-button'
import { AiSourceBadge } from '@/components/event/ai-source-badge'

interface PageProps {
  params: Promise<{ eventId: string }>
}

export default async function OpenQuestionsPage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const [{ data: event }, { data: questions }] = await Promise.all([
    supabase.from('events').select('id, name').eq('id', eventId).single(),
    supabase.from('open_questions').select('*').eq('event_id', eventId).order('created_at'),
  ])

  if (!event) notFound()

  const list = (questions ?? []) as OpenQuestion[]
  const open = list.filter((q) => q.status === 'open')
  const answered = list.filter((q) => q.status === 'answered')

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Open Questions</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{open.length} open · {answered.length} answered</p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-14 flex flex-col items-center gap-3 text-center">
          <HelpCircle className="h-8 w-8 text-muted-foreground/25" />
          <p className="text-sm text-muted-foreground">No open questions. Tell Glenn about things the team still needs to figure out.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {list.map((question) => (
            <div
              key={question.id}
              className={`rounded-lg border bg-card p-3.5 shadow-[0px_1px_2px_rgba(0,0,0,0.04)] space-y-2
                ${question.status === 'answered' ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start gap-2">
                <HelpCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/50" />
                <p className="text-sm flex-1 tracking-tight">{question.question}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  {question.ai_generated && (
                    <AiSourceBadge eventId={eventId} sourceMessageId={question.source_message_id} />
                  )}
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize
                    ${question.status === 'open' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {question.status}
                  </span>
                </div>
              </div>
              {question.status === 'open' && (
                <div className="pl-6">
                  <OpenQuestionResolveButton questionId={question.id} eventId={eventId} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
