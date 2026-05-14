import { NextResponse, type NextRequest } from 'next/server'
import { ExtractUpdatesSchema } from '@/lib/validators/extract'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params

  const body = await request.json().catch(() => null)
  const parsed = ExtractUpdatesSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // Phase 3 will implement keyword-matched mock extraction.
  // For now return a clear not-implemented response so the UI gets structured JSON.
  return NextResponse.json(
    {
      error: 'AI extraction not implemented yet',
      eventId,
      grouped: {
        tasks: [],
        vendors: [],
        budget_items: [],
        timeline_items: [],
        decisions: [],
        risks: [],
        open_questions: [],
      },
    },
    { status: 501 }
  )
}
