import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { RECORD_EDIT_CONFIG, isEditableRecordType } from '@/lib/validators/record-edit'
import { zonedWallClockToUtc } from '@/lib/timeline-format'
import { DEFAULT_EVENT_TZ } from '@/lib/utils'

export async function PATCH(
  request: NextRequest,
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

  const body = await request.json().catch(() => null)
  const parsed = config.schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid record fields', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // config.schema is ZodTypeAny so parsed.data is unknown; every schema in
  // RECORD_EDIT_CONFIG is a strict object, so this cast is safe
  const updateData = parsed.data as Record<string, unknown>

  // Timeline times arrive from the Edit dialog as naive event-local wall-clock
  // ("2026-09-18T12:00"); resolve them to a UTC instant in the event tz before they
  // hit the timestamptz columns (mirrors the approve path — smoke-test D5).
  if (recordType === 'timeline_item') {
    const { data: eventTzRow } = await supabase
      .from('events')
      .select('timezone')
      .eq('id', eventId)
      .single()
    const timeZone = (eventTzRow?.timezone as string | null) ?? DEFAULT_EVENT_TZ
    for (const key of ['starts_at', 'ends_at'] as const) {
      if (typeof updateData[key] === 'string') {
        updateData[key] = zonedWallClockToUtc(updateData[key] as string, timeZone)
      }
    }
  }

  // RLS limits updates to event members; eq(event_id) guards cross-event ids
  const { data: updated, error } = await supabase
    .from(config.table)
    .update(updateData)
    .eq('id', recordId)
    .eq('event_id', eventId)
    .select('id')
    .single()

  if (error || !updated) {
    if (error) console.error('record edit update error:', error)
    return NextResponse.json({ error: 'Record not found or update failed' }, { status: 404 })
  }

  const labelValue = updateData[config.labelField]
  const label = typeof labelValue === 'string' ? labelValue.slice(0, 120) : 'Untitled record'

  await supabase.from('activity_log').insert({
    event_id:      eventId,
    actor_user_id: user.id,
    action:        'record_updated',
    entity_type:   recordType,
    entity_id:     recordId,
    metadata_json: { label },
  })

  return NextResponse.json({ ok: true })
}
