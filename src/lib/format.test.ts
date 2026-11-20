import { describe, expect, test } from 'vitest'
import { formatPercentage, formatRelativeTime } from './format'

describe('formatPercentage', () => {
  test('takes a 0–100 number, not a fraction', () => {
    expect(formatPercentage(67)).toBe('67%')
  })

  test('handles the ends of the range', () => {
    expect(formatPercentage(0)).toBe('0%')
    expect(formatPercentage(100)).toBe('100%')
  })

  test('rounds to whole numbers', () => {
    expect(formatPercentage(66.6)).toBe('67%')
  })
})

describe('formatRelativeTime', () => {
  const NOW = new Date('2026-11-17T12:00:00Z').getTime()
  const SECOND = 1000
  const MINUTE = 60 * SECOND
  const HOUR = 60 * MINUTE

  // `now` is a parameter (defaulting to Date.now()) so this stays a pure,
  // easily tested function. Output is short style, e.g. "4 min ago".
  test.each([
    [NOW - 30 * SECOND, /^30 sec\.? ago$/],
    [NOW - 4 * MINUTE, /^4 min\.? ago$/],
    [NOW - 2 * HOUR, /^2 hr\.? ago$/],
    [NOW - 3 * 24 * HOUR, /^3 days ago$/],
  ])('formats %i relative to now', (timestamp, expected) => {
    expect(formatRelativeTime(timestamp, NOW)).toMatch(expected)
  })

  test('picks the largest whole unit', () => {
    expect(formatRelativeTime(NOW - 90 * MINUTE, NOW)).toMatch(/^1 hr\.? ago$/)
  })
})
