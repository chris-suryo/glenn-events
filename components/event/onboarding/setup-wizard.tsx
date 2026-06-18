'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react'
import { EVENT_TYPES } from './event-types'

type DraftOutcome = 'ready' | 'empty' | 'skipped'

interface OnboardResponse {
  id: string
  draft: DraftOutcome
  ai_run_id?: string
  proposed_count?: number
  error?: string
}

interface SetupWizardProps {
  userId: string
  initialTypicalTypes: string[] | null
}

interface StepConfig {
  title: string
  subtitle?: string
  body: ReactNode
  primaryLabel: string
  onPrimary: () => void
  primaryDisabled?: boolean
  /** When true, the body stretches to fill the screen height (bubble steps). */
  fillBody?: boolean
}

function Bubble({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex min-h-12 items-center rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors',
        selected
          ? 'border-primary bg-accent text-accent-foreground'
          : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/40',
      )}
    >
      {children}
    </button>
  )
}

export function SetupWizard({ userId, initialTypicalTypes }: SetupWizardProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // null preference = never asked → include the one-time account step first.
  const needsAccount = initialTypicalTypes == null
  const steps = useMemo<string[]>(
    () => [...(needsAccount ? ['account'] : []), 'name', 'type', 'date', 'location', 'guests', 'capture'],
    [needsAccount],
  )

  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<'form' | 'submitting'>('form')
  const [draftingPlan, setDraftingPlan] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // account preference (drives bubble ordering + pre-select)
  const [typicalTypes, setTypicalTypes] = useState<string[]>(initialTypicalTypes ?? [])
  const [accountSelected, setAccountSelected] = useState<string[]>([])

  // event fields
  const [name, setName] = useState('')
  const [eventType, setEventType] = useState(() =>
    initialTypicalTypes?.length === 1 ? initialTypicalTypes[0] : '',
  )
  const [customMode, setCustomMode] = useState(false)
  const [customType, setCustomType] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [location, setLocation] = useState('')
  const [attendees, setAttendees] = useState('')
  const [capture, setCapture] = useState('')

  const stepId = steps[index]
  const total = steps.length
  const progressPct = Math.round(((index + 1) / total) * 100)

  function goNext() {
    setCustomMode(false)
    setIndex((i) => Math.min(steps.length - 1, i + 1))
  }
  function goBack() {
    setCustomMode(false)
    setError(null)
    setIndex((i) => Math.max(0, i - 1))
  }

  function toggleAccount(value: string) {
    setAccountSelected((cur) =>
      cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
    )
  }

  async function persistTypicalTypes(types: string[]) {
    try {
      await supabase.from('profiles').upsert({ id: userId, typical_event_types: types }, { onConflict: 'id' })
    } catch {
      // best-effort: a missing column / offline state must not block setup
    }
  }

  function finishAccount(selected: string[]) {
    setTypicalTypes(selected)
    if (selected.length === 1 && !eventType) setEventType(selected[0])
    void persistTypicalTypes(selected)
    goNext()
  }

  function selectType(value: string) {
    setEventType(value)
    goNext()
  }

  const orderedTypes = useMemo(() => {
    const pref = new Set(typicalTypes)
    return [
      ...EVENT_TYPES.filter((t) => pref.has(t.value)),
      ...EVENT_TYPES.filter((t) => !pref.has(t.value)),
    ]
  }, [typicalTypes])

  async function runOnboard(payload: Record<string, unknown>, hadCapture: boolean) {
    if (phase === 'submitting') return
    setError(null)
    setDraftingPlan(hadCapture)
    setPhase('submitting')
    try {
      const res = await fetch('/api/events/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data: OnboardResponse = await res.json()
      if (!res.ok) {
        setPhase('form')
        setError(data.error ?? 'Could not create your event. Please try again.')
        return
      }
      // TEMP (Checkpoint 5 pending): a 'ready' starter package is reviewed in the
      // existing Ask Glenn surface until the dedicated starter-review step lands.
      if (data.draft === 'ready') router.push(`/events/${data.id}/chat`)
      else router.push(`/events/${data.id}`)
      // keep phase 'submitting' through navigation so the form doesn't flash back
    } catch {
      setPhase('form')
      setError('Network error. Please try again.')
    }
  }

  function submitFull() {
    const payload: Record<string, unknown> = { name: name.trim() }
    if (eventType.trim()) payload.event_type = eventType.trim()
    if (eventDate) payload.event_date = eventDate
    if (location.trim()) payload.location = location.trim()
    if (attendees.trim()) payload.attendee_target = Number.parseInt(attendees, 10)
    const note = capture.trim()
    if (note) payload.capture = note
    void runOnboard(payload, !!note)
  }

  function quickCreate() {
    if (!name.trim()) {
      setIndex(steps.indexOf('name'))
      return
    }
    void runOnboard({ name: name.trim() }, false)
  }

  let config: StepConfig
  switch (stepId) {
    case 'account':
      config = {
        title: 'What kinds of events do you plan?',
        subtitle: 'Glenn tailors your setup to match. Pick any that fit.',
        fillBody: true,
        body: (
          <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-2.5">
            {EVENT_TYPES.map((t) => (
              <Bubble key={t.value} selected={accountSelected.includes(t.value)} onClick={() => toggleAccount(t.value)}>
                {t.plural}
              </Bubble>
            ))}
          </div>
        ),
        primaryLabel: accountSelected.length ? 'Continue' : 'Skip for now',
        onPrimary: () => finishAccount(accountSelected),
      }
      break
    case 'name':
      config = {
        title: "Let's start with a name",
        subtitle: 'You can change this anytime.',
        body: (
          <Input
            autoFocus
            aria-label="Event name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                e.preventDefault()
                goNext()
              }
            }}
            placeholder="e.g. Ava & Sam — Garden Wedding"
            className="h-12 text-base"
          />
        ),
        primaryLabel: 'Continue',
        onPrimary: goNext,
        primaryDisabled: !name.trim(),
      }
      break
    case 'type':
      config = {
        title: 'What type of event is it?',
        subtitle: 'This helps Glenn shape the plan.',
        fillBody: true,
        body: (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-2.5">
              {orderedTypes.map((t) => (
                <Bubble key={t.value} selected={!customMode && eventType === t.value} onClick={() => selectType(t.value)}>
                  {t.label}
                </Bubble>
              ))}
              <Bubble selected={customMode} onClick={() => { setCustomMode(true); setEventType('') }}>
                Other…
              </Bubble>
            </div>
            {customMode && (
              <Input
                autoFocus
                aria-label="Custom event type"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customType.trim()) {
                    e.preventDefault()
                    setEventType(customType.trim())
                    goNext()
                  }
                }}
                placeholder="Describe the event type"
                className="h-12 shrink-0 text-base"
              />
            )}
          </div>
        ),
        primaryLabel: customMode || eventType ? 'Continue' : 'Skip for now',
        onPrimary: () => {
          if (customMode) setEventType(customType.trim())
          goNext()
        },
        primaryDisabled: customMode && !customType.trim(),
      }
      break
    case 'date':
      config = {
        title: 'When is it?',
        subtitle: 'Skip if the date isn’t set yet.',
        body: (
          <Input
            type="date"
            autoFocus
            aria-label="Event date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="h-12 text-base"
          />
        ),
        primaryLabel: eventDate ? 'Continue' : 'Skip for now',
        onPrimary: goNext,
      }
      break
    case 'location':
      config = {
        title: 'Where is it?',
        subtitle: 'A venue, a city, or whatever you know so far.',
        body: (
          <Input
            autoFocus
            aria-label="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                goNext()
              }
            }}
            placeholder="e.g. Boston, MA"
            className="h-12 text-base"
          />
        ),
        primaryLabel: location.trim() ? 'Continue' : 'Skip for now',
        onPrimary: goNext,
      }
      break
    case 'guests':
      config = {
        title: 'How many guests?',
        subtitle: 'A rough number is fine.',
        body: (
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            autoFocus
            aria-label="Guest count"
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                goNext()
              }
            }}
            placeholder="e.g. 85"
            className="h-12 text-base"
          />
        ),
        primaryLabel: attendees.trim() ? 'Continue' : 'Skip for now',
        onPrimary: goNext,
      }
      break
    case 'capture':
    default:
      config = {
        title: 'What do you already know?',
        subtitle:
          'Paste notes, a vendor quote, an email — anything. Glenn drafts a starter plan from it for you to review. Skip to start fresh.',
        body: (
          <Textarea
            autoFocus
            aria-label="What you already know"
            value={capture}
            onChange={(e) => setCapture(e.target.value)}
            placeholder="e.g. Venue confirmed for Sep 27, deposit $4,500 due Jun 1. Catering quote ~$12k. AV still unconfirmed."
            className="min-h-[160px] resize-none text-base"
          />
        ),
        primaryLabel: capture.trim() ? 'Draft my plan' : 'Create event',
        onPrimary: submitFull,
      }
      break
  }

  if (phase === 'submitting') {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background px-6 text-center">
        <div className="relative mb-6 flex size-14 items-center justify-center">
          <Loader2 className="absolute size-14 animate-spin text-primary/25" />
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="size-5 text-primary" />
          </span>
        </div>
        <h2 className="font-display text-h1 font-semibold tracking-tight">
          {draftingPlan ? 'Glenn is drafting your starter plan…' : 'Setting up your event…'}
        </h2>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          {draftingPlan
            ? 'Reading your notes and proposing plan updates for you to review.'
            : 'Just a moment.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="px-5 pt-5">
        <div className="mx-auto flex max-w-md items-center gap-3">
          {index > 0 ? (
            <button
              type="button"
              onClick={goBack}
              aria-label="Back"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </button>
          ) : (
            <div className="size-8 shrink-0" />
          )}
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {index + 1}/{total}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-8">
        <div className={cn('mx-auto flex max-w-md flex-col', config.fillBody && 'h-full')}>
          <h1 className="font-display text-h1 font-semibold tracking-tight text-foreground">{config.title}</h1>
          {config.subtitle && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{config.subtitle}</p>
          )}
          <div className={cn('mt-6', config.fillBody && 'flex min-h-0 flex-1 flex-col')}>{config.body}</div>
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </div>
      </div>

      <div className="border-t bg-card/40 px-5 pb-6 pt-4">
        <div className="mx-auto max-w-md space-y-3">
          <Button
            type="button"
            onClick={config.onPrimary}
            disabled={config.primaryDisabled}
            className="h-12 w-full text-base"
          >
            {config.primaryLabel}
          </Button>
          <button
            type="button"
            onClick={quickCreate}
            className="block w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip setup — quick-create with just a name
          </button>
        </div>
      </div>
    </div>
  )
}
