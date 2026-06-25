import type { ProposedUpdate } from '@/lib/types'
import { DEFAULT_EVENT_TZ } from '@/lib/utils'
import { zonedWallClockToUtc } from '@/lib/timeline-format'

export interface ApplyResult {
  table: string
  row: Record<string, unknown>
}

// A calendar-date column (events.event_date, tasks.due_date) holds only the day —
// strip any time the model may have appended so it is never tz-shifted.
function calendarDate(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.slice(0, 10) : null
}

/**
 * Maps a proposed_update into the destination table name and insert row.
 * Pure function — no Supabase calls. `timeZone` is the event's IANA zone, used to
 * resolve naive wall-clock timeline times to a UTC instant before they hit a
 * `timestamptz` column (smoke-test D5).
 */
export function buildDestinationRow(update: ProposedUpdate, timeZone: string = DEFAULT_EVENT_TZ): ApplyResult {
  // payload_json is a typed union — cast through unknown to access fields dynamically
  const p = update.payload_json as unknown as Record<string, unknown>

  // Traceability fields added to every destination row
  const trace = {
    event_id:           update.event_id,
    proposed_update_id: update.id,
    source_message_id:  update.source_message_id,
    ai_run_id:          update.ai_run_id,
    ai_generated:       true,
  }

  switch (update.update_type) {
    case 'task': {
      const ownerSuffix =
        p.owner_name && typeof p.owner_name === 'string'
          ? `\n\nSuggested owner: ${p.owner_name}`
          : ''
      const description =
        typeof p.description === 'string'
          ? `${p.description}${ownerSuffix}`.trim() || null
          : ownerSuffix.trim() || null
      return {
        table: 'tasks',
        row: {
          ...trace,
          title:       p.title,
          description,
          status:      p.status ?? 'todo',
          priority:    p.priority ?? 'medium',
          due_date:    calendarDate(p.due_date),
        },
      }
    }

    case 'vendor':
      return {
        table: 'vendors',
        row: {
          ...trace,
          name:           p.name,
          category:       p.category ?? null,
          contact_name:   p.contact_name ?? null,
          email:          p.email ?? null,
          phone:          p.phone ?? null,
          status:         p.status ?? 'prospect',
          estimated_cost: p.estimated_cost ?? null,
          notes:          p.notes ?? null,
        },
      }

    case 'budget_item': {
      const vendorSuffix =
        p.vendor_name && typeof p.vendor_name === 'string'
          ? ` (Vendor reference: ${p.vendor_name})`
          : ''
      const description =
        typeof p.description === 'string'
          ? `${p.description}${vendorSuffix}`.trim()
          : vendorSuffix.trim() || String(p.category ?? 'Budget item')
      return {
        table: 'budget_items',
        row: {
          ...trace,
          category:       p.category,
          description,
          estimated_cost: p.estimated_cost ?? null,
          actual_cost:    p.actual_cost ?? null,
          status:         p.status ?? 'estimated',
        },
      }
    }

    case 'timeline_item':
      return {
        table: 'timeline_items',
        row: {
          ...trace,
          title:       p.title,
          description: p.description ?? null,
          starts_at:   zonedWallClockToUtc((p.starts_at as string | null) ?? null, timeZone),
          ends_at:     zonedWallClockToUtc((p.ends_at as string | null) ?? null, timeZone),
          type:        p.type ?? 'planning',
        },
      }

    case 'decision':
      return {
        table: 'decisions',
        row: {
          ...trace,
          title:       p.title,
          description: p.description ?? null,
          status:      p.status ?? 'pending',
          decision:    p.decision ?? null,
        },
      }

    case 'risk':
      return {
        table: 'risks',
        row: {
          ...trace,
          title:       p.title,
          description: p.description ?? null,
          severity:    p.severity ?? 'medium',
          status:      p.status ?? 'open',
          mitigation:  p.mitigation ?? null,
        },
      }

    case 'open_question': {
      const ownerSuffix =
        p.owner_name && typeof p.owner_name === 'string'
          ? ` (Suggested owner: ${p.owner_name})`
          : ''
      return {
        table: 'open_questions',
        row: {
          ...trace,
          question: `${String(p.question ?? '')}${ownerSuffix}`.trim(),
          status:   p.status ?? 'open',
        },
      }
    }

    case 'event_detail':
      // Event-level facts patch the events row directly (handled in the approve
      // route's dedicated branch) — they are never inserted into a destination table.
      throw new Error('event_detail updates are applied to the event row, not a destination table')

    default: {
      // Exhaustiveness guard — update_type is a typed union so this should never run
      const exhausted: never = update.update_type
      throw new Error(`Unsupported update_type: ${String(exhausted)}`)
    }
  }
}
