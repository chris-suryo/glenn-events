import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { RECORD_EDIT_CONFIG, isEditableRecordType } from '@/lib/validators/record-edit'
import type { ActivityLog, Json } from '@/lib/types'

export interface ProvenanceBundle {
  record: {
    id: string
    record_type: string
    label: string
    ai_generated: boolean
    created_at: string
  }
  source_message: { id: string; content: string; created_at: string } | null
  proposal: {
    rationale: string | null
    operation: 'insert' | 'update' | 'archive'
    status: string
    payload_json: Json
    target_snapshot_json: Json | null
    reviewed_at: string | null
    reviewer_name: string | null
  } | null
  understood_summary: string[]
  trail: ActivityLog[]
  same_update: { record_type: string; id: string; label: string }[]
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string').slice(0, 4)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string; recordType: string; recordId: string }> }
) {
  const { eventId, recordType, recordId } = await params
  const supabase = await createClient()

  // Auth — proxy.ts marks /api/* public; enforce here
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isEditableRecordType(recordType)) {
    return NextResponse.json({ error: 'Unknown record type' }, { status: 404 })
  }
  const config = RECORD_EDIT_CONFIG[recordType]

  // RLS limits reads to event members; eq(event_id) guards cross-event ids
  const { data: record } = await supabase
    .from(config.table)
    .select('*')
    .eq('id', recordId)
    .eq('event_id', eventId)
    .single()

  if (!record) {
    return NextResponse.json({ error: 'Record not found or access denied' }, { status: 404 })
  }

  const row = record as Record<string, unknown>
  const sourceMessageId = typeof row.source_message_id === 'string' ? row.source_message_id : null
  const aiRunId = typeof row.ai_run_id === 'string' ? row.ai_run_id : null
  const proposedUpdateId = typeof row.proposed_update_id === 'string' ? row.proposed_update_id : null

  const [{ data: message }, { data: aiRun }, { data: proposal }, { data: trail }] = await Promise.all([
    sourceMessageId
      ? supabase.from('messages').select('id, content, created_at').eq('id', sourceMessageId).single()
      : Promise.resolve({ data: null }),
    aiRunId
      ? supabase.from('ai_runs').select('output_json').eq('id', aiRunId).single()
      : Promise.resolve({ data: null }),
    proposedUpdateId
      ? supabase
          .from('proposed_updates')
          .select('rationale, operation, status, payload_json, target_snapshot_json, reviewed_by, reviewed_at')
          .eq('id', proposedUpdateId)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from('activity_log')
      .select('*')
      .eq('event_id', eventId)
      .eq('entity_id', recordId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  let reviewerName: string | null = null
  if (proposal?.reviewed_by) {
    const { data: profile } = await supabase
      .from('public_profiles')
      .select('full_name')
      .eq('id', proposal.reviewed_by)
      .single()
    reviewerName = (profile?.full_name as string | null) ?? null
  }

  // "From the same update" — sibling records created by the same AI run.
  let sameUpdate: { record_type: string; id: string; label: string }[] = []
  if (aiRunId) {
    const groups = await Promise.all(
      Object.entries(RECORD_EDIT_CONFIG).map(async ([type, cfg]) => {
        const { data } = await supabase
          .from(cfg.table)
          .select('*')
          .eq('event_id', eventId)
          .eq('ai_run_id', aiRunId)
          .neq('id', recordId)
        // Dynamic table name yields loosely-typed rows; read the label by key.
        return ((data ?? []) as Record<string, unknown>[]).map((sibling) => {
          const label = sibling[cfg.labelField]
          return {
            record_type: type,
            id: String(sibling.id),
            label: typeof label === 'string' && label.trim() ? label : 'Untitled',
          }
        })
      })
    )
    sameUpdate = groups.flat()
  }

  const outputJson =
    aiRun && typeof aiRun.output_json === 'object' && aiRun.output_json !== null
      ? (aiRun.output_json as Record<string, unknown>)
      : {}

  const labelValue = row[config.labelField]

  const bundle: ProvenanceBundle = {
    record: {
      id: recordId,
      record_type: recordType,
      label: typeof labelValue === 'string' && labelValue ? labelValue : 'Untitled record',
      ai_generated: row.ai_generated === true,
      created_at: typeof row.created_at === 'string' ? row.created_at : '',
    },
    source_message: message
      ? {
          id: message.id as string,
          content: message.content as string,
          created_at: message.created_at as string,
        }
      : null,
    proposal: proposal
      ? {
          rationale: (proposal.rationale as string | null) ?? null,
          operation: proposal.operation as 'insert' | 'update' | 'archive',
          status: proposal.status as string,
          payload_json: proposal.payload_json as Json,
          target_snapshot_json: (proposal.target_snapshot_json as Json | null) ?? null,
          reviewed_at: (proposal.reviewed_at as string | null) ?? null,
          reviewer_name: reviewerName,
        }
      : null,
    understood_summary: stringArray(outputJson.understood_summary),
    trail: (trail ?? []) as ActivityLog[],
    same_update: sameUpdate,
  }

  return NextResponse.json(bundle)
}
