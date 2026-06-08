import * as Sentry from '@sentry/nextjs'

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Sampling — capture 10% of transactions in production, all in development
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session replays — off by default (privacy-sensitive)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Silence noisy browser errors that aren't actionable
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection captured',
  ],

  debug: false,
})
