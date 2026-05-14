import { cn } from '@/lib/utils'

interface GlennLogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function GlennLogo({ className, size = 'md' }: GlennLogoProps) {
  const sizes = {
    sm: { mark: 'h-5 w-5 text-xs', text: 'text-base' },
    md: { mark: 'h-7 w-7 text-sm', text: 'text-xl' },
    lg: { mark: 'h-9 w-9 text-base', text: 'text-2xl' },
  }

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className={cn(
          'rounded-lg bg-primary flex items-center justify-center font-semibold text-primary-foreground shrink-0',
          sizes[size].mark
        )}
      >
        G
      </div>
      <span className={cn('font-semibold tracking-tight text-foreground', sizes[size].text)}>
        Glenn Events
      </span>
    </div>
  )
}
