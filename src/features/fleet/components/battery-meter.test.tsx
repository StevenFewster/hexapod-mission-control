import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { BatteryMeter } from './battery-meter'

const getMeter = () => screen.getByRole('meter', { name: 'Battery' })

describe('BatteryMeter', () => {
  test('is an accessible meter with a 0–100 range', () => {
    render(<BatteryMeter level={67} />)

    const meter = getMeter()
    expect(meter).toHaveAttribute('aria-valuenow', '67')
    expect(meter).toHaveAttribute('aria-valuemin', '0')
    expect(meter).toHaveAttribute('aria-valuemax', '100')
  })

  test('shows the formatted percentage as text', () => {
    render(<BatteryMeter level={67} />)

    expect(getMeter()).toHaveTextContent('67%')
  })

  // Boundaries matter: ≤ 20 danger, ≤ 40 caution, otherwise ok.
  test.each([
    [15, 'danger'],
    [20, 'danger'],
    [21, 'caution'],
    [40, 'caution'],
    [41, 'ok'],
    [100, 'ok'],
  ])('at %i%% the tone is %s', (level, tone) => {
    render(<BatteryMeter level={level} />)

    expect(getMeter()).toHaveAttribute('data-tone', tone)
  })

  // Each segment carries data-filled="true" | "false".
  // Rounding up means any charge at all shows at least one segment.
  test.each([
    [0, 0],
    [1, 1],
    [67, 7],
    [100, 10],
  ])('at %i% it fills %i of 10 segments', (level, filled) => {
    render(<BatteryMeter level={level} />)

    const meter = getMeter()
    expect(meter.querySelectorAll('[data-filled]')).toHaveLength(10)
    expect(meter.querySelectorAll('[data-filled="true"]')).toHaveLength(filled)
  })

  test('forwards props and merges className onto the root', () => {
    render(<BatteryMeter level={50} className="w-40" data-testid="battery" />)

    expect(screen.getByTestId('battery')).toBe(getMeter())
    expect(getMeter()).toHaveClass('w-40')
  })
})
