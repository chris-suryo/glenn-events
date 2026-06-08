'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GlennLogo } from '@/components/shared/glenn-logo'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/callback?next=/update-password`

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }

    setLoading(false)
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="flex flex-col items-center gap-2">
        <GlennLogo />
        <p className="text-sm text-muted-foreground tracking-tight">
          AI-powered event operations
        </p>
      </div>

      <Card className="border shadow-[0px_0px_0px_1px_rgba(0,0,0,0.06),0px_4px_16px_rgba(0,0,0,0.07)]">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold tracking-tight">Reset your password</CardTitle>
          <CardDescription className="text-sm">
            Enter your email and we'll send a reset link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <p className="text-sm text-primary">
                Check your email for a password reset link.
              </p>
              <Link
                href="/login"
                className="block text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full shadow-[0px_0px_0px_1px_rgba(255,255,255,0.12)_inset]" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </Button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Glenn Events · Calm, operational, trustworthy.
      </p>
    </div>
  )
}
