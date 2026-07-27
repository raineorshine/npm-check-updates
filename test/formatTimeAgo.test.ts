import { describe, expect, it } from 'vitest'
import formatTimeAgo from '../src/lib/formatTimeAgo.ts'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const YEAR = 365 * DAY

describe('formatTimeAgo', () => {
  it('formats recent times as "just now"', () => {
    expect(formatTimeAgo(Date.now())).toBe('just now')
    expect(formatTimeAgo(Date.now() - 5 * SECOND)).toBe('just now')
  })

  it('formats seconds', () => {
    expect(formatTimeAgo(Date.now() - 45 * SECOND)).toBe('45 seconds ago')
  })

  it('formats minutes', () => {
    expect(formatTimeAgo(Date.now() - 2 * MINUTE)).toBe('2 minutes ago')
  })

  it('formats hours', () => {
    expect(formatTimeAgo(Date.now() - 3 * HOUR)).toBe('3 hours ago')
  })

  it('formats a single day', () => {
    expect(formatTimeAgo(Date.now() - DAY)).toBe('1 day ago')
  })

  it('formats weeks', () => {
    expect(formatTimeAgo(Date.now() - 2 * WEEK)).toBe('2 weeks ago')
  })

  it('formats years', () => {
    expect(formatTimeAgo(Date.now() - 2 * YEAR)).toBe('2 years ago')
  })

  it('formats future times', () => {
    // mid-bucket (1.5 days) so a small clock gap can't shift the floored result across a boundary
    expect(formatTimeAgo(Date.now() + DAY + 12 * HOUR)).toBe('in 1 day')
  })

  it('accepts an ISO string', () => {
    expect(formatTimeAgo(new Date(Date.now() - DAY).toISOString())).toBe('1 day ago')
  })

  it('parses the exact ISO shape returned by the npm registry', () => {
    expect(formatTimeAgo('2024-06-14T00:00:00.000Z')).not.toContain('NaN')
  })

  it('does not silently produce NaN for a stringified epoch timestamp', () => {
    expect(formatTimeAgo(String(Date.now() - DAY))).not.toContain('NaN')
  })
})
