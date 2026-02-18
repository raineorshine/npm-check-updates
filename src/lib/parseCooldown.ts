/**
 * Parses a cooldown string (e.g. "6d", "12h", "30m") into a number of days.
 * Returns `null` if the string does not match a valid format.
 */
export function parseCooldownString(s: string): number | null {
  const match = s.match(/^(\d+(?:\.\d+)?)(d|h|m)$/)
  if (!match) return null

  const value = parseFloat(match[1])
  const unit = match[2]

  if (unit === 'd') return value
  if (unit === 'h') return value / 24
  // unit === 'm'
  return value / (24 * 60)
}
