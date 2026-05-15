import { NextResponse, type NextRequest } from 'next/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Phase 5 will implement: use createClient() from @/lib/supabase/server,
  // verify caller is an event_member, set proposed_updates.status = 'rejected',
  // write activity_log.
  return NextResponse.json(
    { error: 'Reject flow not implemented yet', updateId: id },
    { status: 501 }
  )
}
