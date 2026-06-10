'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function NewEventPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    event_type: '',
    event_date: '',
    location: '',
    attendee_target: '',
    budget_target: '',
  })

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:            form.name.trim(),
          description:     form.description.trim() || undefined,
          event_type:      form.event_type.trim()  || undefined,
          event_date:      form.event_date          || undefined,
          location:        form.location.trim()     || undefined,
          attendee_target: form.attendee_target ? parseInt(form.attendee_target) : undefined,
          budget_target:   form.budget_target   ? parseFloat(form.budget_target) : undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Could not create event.')
        setLoading(false)
        return
      }

      router.push(`/events/${data.id}`)
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6 max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'inline-flex items-center')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Dashboard
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create a new event</CardTitle>
          <CardDescription>
            Fill in what you know — name is all you need to start. After creating, tell Glenn about vendors, dates, budget, and tasks in plain language.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Event name *</Label>
              <Input
                id="name"
                placeholder="Q3 Client Networking Dinner"
                value={form.name}
                onChange={set('name')}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Brief overview of the event…"
                value={form.description}
                onChange={set('description')}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="event_type">Event type</Label>
                <Input
                  id="event_type"
                  placeholder="Corporate dinner"
                  value={form.event_type}
                  onChange={set('event_type')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="event_date">Event date</Label>
                <Input
                  id="event_date"
                  type="date"
                  value={form.event_date}
                  onChange={set('event_date')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="Boston, MA"
                value={form.location}
                onChange={set('location')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="attendee_target">Expected attendees</Label>
                <Input
                  id="attendee_target"
                  type="number"
                  placeholder="85"
                  value={form.attendee_target}
                  onChange={set('attendee_target')}
                  min={1}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="budget_target">Budget ($)</Label>
                <Input
                  id="budget_target"
                  type="number"
                  placeholder="18000"
                  value={form.budget_target}
                  onChange={set('budget_target')}
                  min={0}
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating event…' : 'Create event'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
