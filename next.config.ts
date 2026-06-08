import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  /* config options here */
}

export default withSentryConfig(nextConfig, {
  // Sentry org and project — set in CI/CD environment, not committed
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Suppress the Sentry CLI output during builds
  silent: !process.env.CI,

  // Upload source maps to Sentry for readable stack traces in production.
  // Requires SENTRY_AUTH_TOKEN env var — gracefully skipped if not set.
  widenClientFileUpload: true,

  // Hides Sentry telemetry from the build output
  telemetry: false,

})
