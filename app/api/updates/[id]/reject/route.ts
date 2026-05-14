import { NextResponse, type NextRequest } from 'next/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Phase 4 will implement: set proposed_updates.status = 'rejected',
  // write activity_log.
  return NextResponse.json(
    { error: 'Reject flow not implemented yet', updateId: id },
    { status: 501 }
  )
}
