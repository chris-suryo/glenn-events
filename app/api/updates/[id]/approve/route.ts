import { NextResponse, type NextRequest } from 'next/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Phase 5 will implement: use createClient() from @/lib/supabase/server,
  // verify caller is an event_member, look up proposed_update, insert into
  // the destination table, set status = 'applied', write activity_log.
  return NextResponse.json(
    { error: 'Approval flow not implemented yet', updateId: id },
    { status: 501 }
  )
}
