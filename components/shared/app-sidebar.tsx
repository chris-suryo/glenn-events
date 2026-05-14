'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  CalendarDays,
  Settings,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlennLogo } from './glenn-logo'

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
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  )
}

interface EventNavProps {
  eventId: string
  eventName: string
}

const eventSubNav = [
  { href: '', label: 'Command Center' },
  { href: '/chat', label: 'Chat' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/vendors', label: 'Vendors' },
  { href: '/budget', label: 'Budget' },
  { href: '/timeline', label: 'Timeline' },
  { href: '/decisions', label: 'Decisions' },
  { href: '/risks', label: 'Risks' },
]

function EventNav({ eventId, eventName }: EventNavProps) {
  const pathname = usePathname()
  const base = `/events/${eventId}`

  return (
    <div className="mt-1">
      <div className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground">
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium truncate">{eventName}</span>
      </div>
      <div className="mt-0.5 space-y-0.5 pl-3">
        {eventSubNav.map(({ href, label }) => {
          const fullHref = `${base}${href}`
          const active = href === ''
            ? pathname === base || pathname === `${base}/`
            : pathname.startsWith(fullHref)

          return (
            <Link
              key={fullHref}
              href={fullHref}
              className={cn(
                'flex items-center rounded-md px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'bg-accent text-accent-foreground font-medium'
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

interface AppSidebarProps {
  eventId?: string
  eventName?: string
}

export function AppSidebar({ eventId, eventName }: AppSidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-sidebar px-3 py-4 shrink-0">
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

        {eventId && eventName && (
          <EventNav eventId={eventId} eventName={eventName} />
        )}
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
