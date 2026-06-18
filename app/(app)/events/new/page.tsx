import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SetupWizard } from '@/components/event/onboarding/setup-wizard'

export default async function NewEventPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // One-time event-type preference. null = never asked → the wizard shows the
  // account step. Defensive: if migration 012 isn't applied yet, the column read
  // yields no value, which also reads as "never asked".
  let initialTypicalTypes: string[] | null = null
  const { data: profile } = await supabase
    .from('profiles')
    .select('typical_event_types')
    .eq('id', user.id)
    .maybeSingle()
  const stored = (profile as { typical_event_types?: string[] | null } | null)?.typical_event_types
  if (Array.isArray(stored)) initialTypicalTypes = stored

  return <SetupWizard userId={user.id} initialTypicalTypes={initialTypicalTypes} />
}
