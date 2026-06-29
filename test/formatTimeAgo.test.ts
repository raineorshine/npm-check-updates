import { describe, expect, it } from 'vitest'
import formatTimeAgo from '../src/lib/formatTimeAgo.ts'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

describe('formatTimeAgo', () => {
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

  it('formats future times', () => {
    expect(formatTimeAgo(Date.now() + DAY)).toBe('in 1 day')
  })

  it('accepts an ISO string', () => {
    expect(formatTimeAgo(new Date(Date.now() - DAY).toISOString())).toBe('1 day ago')
  })
})
