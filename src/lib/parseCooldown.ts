/** Matches a unit-suffixed cooldown string: "6d", "12h", "30m". Group 1 is the number, group 2 the unit. */
export const COOLDOWN_PATTERN = /^(\d+(?:\.\d+)?)(d|h|m)$/

/**
 * Parses a cooldown string (e.g. "6d", "12h", "30m") into a number of days.
 * Returns `null` if the string does not match a valid format.
 */
function parseCooldown(s: string): number | null {
  const match = s.match(COOLDOWN_PATTERN)
  if (!match) return null

  const value = Number.parseFloat(match[1])
  const unit = match[2]

  if (unit === 'd') return value
  if (unit === 'h') return value / 24
  // unit === 'm'
  return value / (24 * 60)
}

export default parseCooldown
