const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
]

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'always' })

/** Formats a timestamp as a relative time string, e.g. "3 days ago". */
function formatTimeAgo(date: string | number | Date): string {
  let duration = (new Date(date).getTime() - Date.now()) / 1000

  for (const { amount, unit } of DIVISIONS) {
    if (Math.abs(duration) < amount) {
      return rtf.format(Math.round(duration), unit)
    }

    duration /= amount
  }

  return rtf.format(Math.round(duration), 'year')
}

export default formatTimeAgo
