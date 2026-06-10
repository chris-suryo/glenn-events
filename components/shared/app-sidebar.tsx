'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  CalendarDays,
  Settings,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlennLogo } from './glenn-logo'
import { createClient } from '@/lib/supabase/client'

const topNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/events', label: 'Events', icon: CalendarDays },
]

const bottomNav = [
  { href: '/settings', label: 'Settings', icon: Settings },
]

interface NavItemProps {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  active: boolean
}

function NavItem({ href, label, icon: Icon, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  )
}

const eventSubNav = [
  { href: '',          label: 'Command Center' },
  { href: '/chat',     label: 'Ask Glenn' },
  { href: '/plan',     label: 'Plan' },
  { href: '/activity', label: 'Activity' },
]

// Sub-routes that live under the Plan umbrella — Plan stays active when on any of these
const PLAN_SUB_ROUTES = ['/tasks', '/vendors', '/budget', '/timeline', '/decisions', '/risks', '/open-questions']

function EventNav({ eventId }: { eventId: string }) {
  const pathname = usePathname()
  const base = `/events/${eventId}`
  const [eventName, setEventName] = useState<string>('')

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('events')
      .select('name')
      .eq('id', eventId)
      .single()
      .then(({ data }) => { if (data) setEventName(data.name) })
  }, [eventId])

  return (
    <div className="mt-1">
      <div className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground/70">
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span className="font-medium truncate tracking-tight">{eventName || '…'}</span>
      </div>
      <div className="mt-0.5 space-y-px pl-3">
        {eventSubNav.map(({ href, label }) => {
          const fullHref = `${base}${href}`
          const active = href === ''
            ? pathname === base || pathname === `${base}/`
            : href === '/plan'
              ? pathname.startsWith(`${base}/plan`) || PLAN_SUB_ROUTES.some((r) => pathname.startsWith(`${base}${r}`))
              : pathname.startsWith(fullHref)

          return (
            <Link
              key={fullHref}
              href={fullHref}
              className={cn(
                'flex items-center rounded-md px-3 py-1.5 text-sm transition-all duration-150',
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export function AppSidebar({ className }: { className?: string }) {
  const pathname = usePathname()
  const match = pathname.match(/^\/events\/([^/]+)/)
  const currentEventId = match?.[1]

  return (
    <aside className={cn('flex h-full w-56 flex-col border-r bg-sidebar px-3 py-5 shrink-0', className)}>
      <div className="mb-6 px-1">
        <GlennLogo size="sm" />
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        {topNav.map(({ href, label, icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={icon}
            active={pathname.startsWith(href)}
          />
        ))}

        {currentEventId && <EventNav eventId={currentEventId} />}
      </nav>

      <nav className="flex flex-col gap-0.5 border-t pt-3">
        {bottomNav.map(({ href, label, icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={icon}
            active={pathname.startsWith(href)}
          />
        ))}
      </nav>
    </aside>
  )
}
