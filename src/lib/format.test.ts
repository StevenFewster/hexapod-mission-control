import { describe, expect, test } from 'vitest'
import { formatPercentage } from './format'

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
