import { redirectToPlanTab, type LegacySearchParams } from '@/lib/plan-redirect'

interface PageProps {
  params: Promise<{ eventId: string }>
  searchParams: Promise<LegacySearchParams>
}

export default async function VendorsPage(props: PageProps) {
  const { eventId } = await props.params
  redirectToPlanTab(eventId, 'vendors', await props.searchParams)
}
