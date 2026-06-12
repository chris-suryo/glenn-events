import type { ActivityLog } from '@/lib/types'

const ENTITY_TYPE_LABELS: Record<string, string> = {
  task:          'task',
  vendor:        'vendor',
  budget_item:   'budget item',
  timeline_item: 'timeline item',
  decision:      'decision',
  risk:          'risk',
  open_question: 'open question',
}

const DESTINATION_LABELS: Record<string, string> = {
  task:          'Tasks',
  vendor:        'Vendors',
  budget_item:   'Budget',
  timeline_item: 'Timeline',
  decision:      'Decisions',
  risk:          'Risks',
  open_question: 'Open Questions',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function metadataString(entry: ActivityLog, key: string): string | null {
  if (!isRecord(entry.metadata_json)) return null
  const value = entry.metadata_json[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export function activityLabel(entry: ActivityLog): string {
  const label = metadataString(entry, 'label')

  if (entry.action === 'proposed_updates_created') {
    const total = isRecord(entry.metadata_json) && typeof entry.metadata_json.total === 'number'
      ? entry.metadata_json.total
      : null
    if (total !== null) {
      return `Glenn proposed ${total} update${total !== 1 ? 's' : ''}`
    }
    return 'Glenn proposed updates'
  }

  if (entry.action === 'proposed_update_applied') {
    const destination = DESTINATION_LABELS[entry.entity_type]
    if (label && destination) return `Added to ${destination}: ${label}`
    const entityLabel = ENTITY_TYPE_LABELS[entry.entity_type]
    return entityLabel ? `Applied ${entityLabel} update` : 'Applied plan update'
  }

  if (entry.action === 'proposed_update_corrected') {
    const entityLabel = ENTITY_TYPE_LABELS[entry.entity_type]
    const beforeLabel = metadataString(entry, 'before_label')
    const afterLabel = metadataString(entry, 'after_label')
    if (entityLabel && beforeLabel && afterLabel) {
      return `Updated ${entityLabel}: ${beforeLabel} → ${afterLabel}`
    }
    if (label && entityLabel) return `Updated ${entityLabel}: ${label}`
    return entityLabel ? `Updated ${entityLabel}` : 'Updated plan record'
  }

  if (entry.action === 'proposed_update_superseded') {
    if (label) return `Replaced by a newer suggestion: ${label}`
    return 'Replaced by a newer suggestion'
  }

  if (entry.action === 'proposed_update_rejected') {
    const updateType = metadataString(entry, 'update_type') ?? entry.entity_type
    const entityLabel = ENTITY_TYPE_LABELS[updateType]
    if (label && entityLabel) return `Dismissed ${entityLabel}: ${label}`
    return entityLabel ? `Dismissed ${entityLabel} suggestion` : 'Dismissed suggestion'
  }

  if (entry.action === 'record_updated') {
    const entityLabel = ENTITY_TYPE_LABELS[entry.entity_type]
    if (label && entityLabel) return `Updated ${entityLabel}: ${label}`
    return entityLabel ? `Updated ${entityLabel}` : 'Updated plan record'
  }

  if (entry.action === 'record_archived') {
    const entityLabel = ENTITY_TYPE_LABELS[entry.entity_type] ?? 'record'
    const reason = metadataString(entry, 'reason')
    if (label && reason) return `Removed ${entityLabel}: ${label} — ${reason}`
    if (label) return `Removed ${entityLabel}: ${label}`
    return `Removed ${entityLabel}`
  }

  return entry.action.replace(/_/g, ' ')
}

const CHANGED_FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  category: 'Category',
  contact_name: 'Contact',
  email: 'Email',
  phone: 'Phone',
  status: 'Status',
  estimated_cost: 'Cost',
  actual_cost: 'Actual cost',
  notes: 'Notes',
  description: 'Description',
  title: 'Title',
}

function metadataStringArray(entry: ActivityLog, key: string): string[] {
  if (!isRecord(entry.metadata_json)) return []
  const value = entry.metadata_json[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

const GLENN_PROPOSAL_NOTE = 'Reviewed & approved Glenn suggestion'

// Secondary credibility line under an activity entry — what changed and how
// the change was authorized. Built entirely from already-logged metadata.
export function activityDetail(entry: ActivityLog): string | null {
  if (entry.action === 'proposed_update_corrected') {
    const fields = metadataStringArray(entry, 'changed_fields')
      .map((field) => CHANGED_FIELD_LABELS[field] ?? field.replace(/_/g, ' '))
    const changed = fields.length > 0 ? `Changed: ${fields.join(', ')}` : null
    return [changed, GLENN_PROPOSAL_NOTE].filter(Boolean).join(' · ')
  }
  if (entry.action === 'proposed_update_applied') return GLENN_PROPOSAL_NOTE
  if (entry.action === 'record_archived') {
    return metadataString(entry, 'proposed_update_id') ? GLENN_PROPOSAL_NOTE : null
  }
  if (entry.action === 'record_updated') return 'Manual edit'
  return null
}

const PLAN_TAB_BY_TYPE: Record<string, string> = {
  task:          'tasks',
  vendor:        'vendors',
  budget_item:   'budget',
  timeline_item: 'timeline',
  decision:      'decisions',
  risk:          'risks',
  open_question: 'questions',
}

const PLAN_RECORD_ACTIONS = new Set([
  'proposed_update_applied',
  'proposed_update_corrected',
  'record_updated',
  'record_archived',
])

// For archived records the highlight finds nothing (they're hidden from Plan);
// the tab still opens, which is the honest answer — the record is gone.
export function activityPlanHref(entry: ActivityLog, eventId: string): string | null {
  if (!PLAN_RECORD_ACTIONS.has(entry.action) || !entry.entity_id) return null
  const tab = PLAN_TAB_BY_TYPE[entry.entity_type]
  if (!tab) return null
  return `/events/${eventId}/plan?tab=${tab}&highlight=${entry.entity_id}`
}

export function activityDot(action: string): string {
  if (action === 'proposed_update_applied')  return 'bg-emerald-500'
  if (action === 'proposed_update_corrected') return 'bg-sky-500'
  if (action === 'proposed_update_rejected') return 'bg-rose-400'
  if (action === 'record_updated')           return 'bg-sky-400'
  if (action === 'record_archived')          return 'bg-rose-500'
  if (action === 'proposed_update_superseded') return 'bg-slate-400'
  return 'bg-indigo-400'
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}
