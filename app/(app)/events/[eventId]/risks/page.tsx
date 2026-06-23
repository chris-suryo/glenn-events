import { redirectToPlanTab, type LegacySearchParams } from '@/lib/plan-redirect'

interface PageProps {
  params: Promise<{ eventId: string }>
  searchParams: Promise<LegacySearchParams>
}

export default async function RisksPage(props: PageProps) {
  const { eventId } = await props.params
  redirectToPlanTab(eventId, 'open-items', await props.searchParams)
}
