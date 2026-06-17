'use client'

import type { ComponentProps } from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

// Wraps next-themes so Glenn's tokens can flip themes later. Mounted in the root
// layout with defaultTheme="light" and no toggle — the "Mission Control" dark
// palette stays dormant until a later branch ships a theme switch.
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
