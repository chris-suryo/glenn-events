import { NextResponse, type NextRequest } from 'next/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Phase 4 will implement: look up proposed_update, insert into destination
  // table, set status = 'applied', write activity_log.
  return NextResponse.json(
    { error: 'Approval flow not implemented yet', updateId: id },
    { status: 501 }
  )
}
