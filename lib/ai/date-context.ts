// Today's-date awareness for extraction. Claude has no inherent sense of the
// current date, so without an explicit anchor it defaults dated values to a
// training-era year (the wrong-year cascade from the smoke test — D4/D10). We
// resolve today's wall-clock date in the EVENT's timezone (so it's correct near
// midnight) and hand the model an explicit anchor + a resolution rule.

export function buildTodayDirective(now: Date, timeZone: string): string {
  let today: string
  try {
    today = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(now)
  } catch {
    // Defensive: a corrupted/invalid IANA zone shouldn't break extraction.
    today = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(now)
  }

  return (
    `Today is ${today} (timezone ${timeZone}). ` +
    'Resolve every date against today. When the user gives a date with no year ' +
    '(e.g. "September 18") or a relative date (e.g. "next Friday", "in three weeks", ' +
    '"this weekend"), choose the next FUTURE occurrence and use any weekday they state ' +
    'to disambiguate. Never default to a past year. If a date is genuinely ambiguous or ' +
    'unstated, leave it null and raise an open question instead of guessing.'
  )
}
