'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { EditableRecordType } from '@/lib/validators/record-edit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'

type FieldKind = 'text' | 'textarea' | 'date' | 'number' | 'select'

interface FieldConfig {
  key: string
  label: string
  kind: FieldKind
  options?: string[]
  required?: boolean
}

const FORM_FIELDS: Record<EditableRecordType, FieldConfig[]> = {
  task: [
    { key: 'title', label: 'Title', kind: 'text', required: true },
    { key: 'description', label: 'Notes', kind: 'textarea' },
    { key: 'due_date', label: 'Due date', kind: 'date' },
    { key: 'priority', label: 'Priority', kind: 'select', options: ['low', 'medium', 'high'] },
  ],
  vendor: [
    { key: 'name', label: 'Vendor name', kind: 'text', required: true },
    { key: 'category', label: 'Category', kind: 'text' },
    { key: 'contact_name', label: 'Contact', kind: 'text' },
    { key: 'email', label: 'Email', kind: 'text' },
    { key: 'phone', label: 'Phone', kind: 'text' },
    { key: 'estimated_cost', label: 'Estimated cost', kind: 'number' },
    { key: 'notes', label: 'Notes', kind: 'textarea' },
  ],
  budget_item: [
    { key: 'description', label: 'Description', kind: 'text', required: true },
    { key: 'category', label: 'Category', kind: 'text', required: true },
    { key: 'estimated_cost', label: 'Estimated cost', kind: 'number' },
    { key: 'actual_cost', label: 'Actual cost', kind: 'number' },
  ],
  timeline_item: [
    { key: 'title', label: 'Title', kind: 'text', required: true },
    { key: 'description', label: 'Description', kind: 'textarea' },
    { key: 'starts_at', label: 'Starts', kind: 'date' },
    { key: 'ends_at', label: 'Ends', kind: 'date' },
    { key: 'type', label: 'Type', kind: 'select', options: ['milestone', 'task', 'deadline', 'planning'] },
  ],
  decision: [
    { key: 'title', label: 'Title', kind: 'text', required: true },
    { key: 'description', label: 'Context', kind: 'textarea' },
    { key: 'decision', label: 'Decision', kind: 'textarea' },
  ],
  risk: [
    { key: 'title', label: 'Title', kind: 'text', required: true },
    { key: 'description', label: 'Description', kind: 'textarea' },
    { key: 'severity', label: 'Severity', kind: 'select', options: ['low', 'medium', 'high'] },
    { key: 'mitigation', label: 'Mitigation', kind: 'textarea' },
  ],
  open_question: [
    { key: 'question', label: 'Question', kind: 'textarea', required: true },
  ],
}

const TYPE_TITLES: Record<EditableRecordType, string> = {
  task:          'Edit task',
  vendor:        'Edit vendor',
  budget_item:   'Edit budget item',
  timeline_item: 'Edit timeline item',
  decision:      'Edit decision',
  risk:          'Edit risk',
  open_question: 'Edit question',
}

interface RecordEditButtonProps {
  eventId: string
  recordType: EditableRecordType
  recordId: string
  initial: Record<string, string | number | null>
}

function initialFormValues(fields: FieldConfig[], initial: RecordEditButtonProps['initial']) {
  const values: Record<string, string> = {}
  for (const field of fields) {
    const raw = initial[field.key]
    if (raw === null || raw === undefined) {
      values[field.key] = ''
    } else if (field.kind === 'date') {
      values[field.key] = String(raw).slice(0, 10)
    } else {
      values[field.key] = String(raw)
    }
  }
  return values
}

export function RecordEditButton({ eventId, recordType, recordId, initial }: RecordEditButtonProps) {
  const router = useRouter()
  const fields = FORM_FIELDS[recordType]
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [values, setValues] = useState<Record<string, string>>(() => initialFormValues(fields, initial))

  function openForm() {
    setValues(initialFormValues(fields, initial))
    setOpen(true)
  }

  function setValue(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  async function handleSave() {
    const payload: Record<string, unknown> = {}
    for (const field of fields) {
      const raw = values[field.key].trim()
      if (field.kind === 'number') {
        const parsed = Number(raw)
        payload[field.key] = raw.length > 0 && Number.isFinite(parsed) ? parsed : null
      } else if (field.required || field.kind === 'select') {
        payload[field.key] = raw
      } else {
        payload[field.key] = raw.length > 0 ? raw : null
      }
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/events/${eventId}/records/${recordType}/${recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Could not save changes')
      }
      toast.success('Saved. The plan is updated.')
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openForm}
        aria-label={TYPE_TITLES[recordType]}
        title={TYPE_TITLES[recordType]}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors shrink-0"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cancel editing"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-xl border bg-card p-4 shadow-xl">
            <p className="text-sm font-semibold mb-3">{TYPE_TITLES[recordType]}</p>
            <div className="flex flex-col gap-3">
              {fields.map((field) => (
                <div key={field.key} className="flex flex-col gap-1">
                  <Label htmlFor={`${recordId}-${field.key}`} className="text-xs text-muted-foreground">
                    {field.label}
                  </Label>
                  {field.kind === 'textarea' ? (
                    <Textarea
                      id={`${recordId}-${field.key}`}
                      value={values[field.key]}
                      onChange={(event) => setValue(field.key, event.target.value)}
                      className="min-h-20"
                    />
                  ) : field.kind === 'select' ? (
                    <select
                      id={`${recordId}-${field.key}`}
                      value={values[field.key]}
                      onChange={(event) => setValue(field.key, event.target.value)}
                      className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {(field.options ?? []).map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={`${recordId}-${field.key}`}
                      type={field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'}
                      value={values[field.key]}
                      onChange={(event) => setValue(field.key, event.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                size="sm"
                disabled={saving || fields.some((field) => field.required && values[field.key].trim().length === 0)}
                onClick={handleSave}
              >
                {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
                Save
              </Button>
              <Button size="sm" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
