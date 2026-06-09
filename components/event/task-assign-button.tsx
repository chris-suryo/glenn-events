'use client'

import { useState, useTransition } from 'react'
import { UserPlus } from 'lucide-react'
import { UserAvatar } from './user-avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'

export interface EventMember {
  user_id: string
  full_name: string | null
  avatar_url: string | null
}

interface TaskAssignButtonProps {
  taskId: string
  eventId: string
  currentOwnerId: string | null
  members: EventMember[]
}

export function TaskAssignButton({ taskId, eventId, currentOwnerId, members }: TaskAssignButtonProps) {
  const [optimisticOwnerId, setOptimisticOwnerId] = useState<string | null>(currentOwnerId)
  const [, startTransition] = useTransition()

  const currentMember = members.find((m) => m.user_id === optimisticOwnerId) ?? null

  function assign(userId: string | null) {
    if (userId === optimisticOwnerId) return
    const prev = optimisticOwnerId
    setOptimisticOwnerId(userId)
    startTransition(async () => {
      const res = await fetch(`/api/events/${eventId}/tasks/${taskId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_user_id: userId }),
      })
      if (!res.ok) setOptimisticOwnerId(prev)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={currentMember ? `Assigned to ${currentMember.full_name ?? 'user'}` : 'Assign task'}
        title={currentMember?.full_name ?? 'Assign to team member'}
      >
        {currentMember ? (
          <UserAvatar fullName={currentMember.full_name} avatarUrl={currentMember.avatar_url} size="xs" />
        ) : (
          <span className="h-5 w-5 inline-flex items-center justify-center rounded-full border border-dashed border-muted-foreground/30 hover:border-muted-foreground/60 transition-colors">
            <UserPlus className="h-2.5 w-2.5 text-muted-foreground/50" />
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Assign to</DropdownMenuLabel>
          {members.map((m) => (
            <DropdownMenuItem
              key={m.user_id}
              onClick={() => assign(m.user_id)}
              className={`gap-2 ${optimisticOwnerId === m.user_id ? 'font-semibold' : ''}`}
            >
              <UserAvatar fullName={m.full_name} avatarUrl={m.avatar_url} size="xs" />
              {m.full_name ?? 'Unknown'}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {optimisticOwnerId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => assign(null)} className="text-muted-foreground">
              Remove assignment
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
