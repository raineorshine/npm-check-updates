// 365 days / 7 days per week / 12 months
const WEEKS_PER_MONTH = 365 / 7 / 12

const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: WEEKS_PER_MONTH, unit: 'week' },
  { amount: 12, unit: 'month' },
]

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always' })

/** Formats a timestamp as a relative time string, e.g. "3 days ago". */
function formatTimeAgo(date: string | number | Date): string {
  const parsed = typeof date === 'string' && /^\d+$/.test(date) ? Number(date) : date
  let duration = (new Date(parsed).getTime() - Date.now()) / 1000

  if (Math.abs(duration) < 10) {
    return 'just now'
  }

  // truncate rather than round so the elapsed time is never overstated (e.g. 1.9 days -> "1 day ago")
  for (const { amount, unit } of DIVISIONS) {
    if (Math.abs(duration) < amount) {
      return rtf.format(Math.trunc(duration), unit)
    }
    duration /= amount
  }

  return rtf.format(Math.trunc(duration), 'year')
}

export default formatTimeAgo
