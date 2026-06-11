import { redirect } from 'next/navigation'

export type LegacySearchParams = Record<string, string | string[] | undefined>

export function redirectToPlanTab(
  eventId: string,
  tab: string,
  searchParams: LegacySearchParams
): never {
  const qs = new URLSearchParams({ tab })
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'tab') continue
    if (typeof value === 'string') {
      qs.set(key, value)
    } else if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v)
    }
  }
  redirect(`/events/${eventId}/plan?${qs.toString()}`)
}
