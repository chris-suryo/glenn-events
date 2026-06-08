interface UserAvatarProps {
  fullName: string | null
  avatarUrl: string | null
  size?: 'xs' | 'sm'
}

function initials(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const SIZE_CLASSES = {
  xs: 'h-5 w-5 text-[10px]',
  sm: 'h-6 w-6 text-xs',
}

export function UserAvatar({ fullName, avatarUrl, size = 'sm' }: UserAvatarProps) {
  const sizeClass = SIZE_CLASSES[size]

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={fullName ?? 'User'}
        className={`${sizeClass} rounded-full object-cover ring-1 ring-border shrink-0`}
      />
    )
  }

  return (
    <span
      className={`${sizeClass} inline-flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-semibold ring-1 ring-border shrink-0`}
      title={fullName ?? undefined}
    >
      {initials(fullName)}
    </span>
  )
}
