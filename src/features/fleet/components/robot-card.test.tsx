import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { makeRobot } from '../testing/make-robot'
import { RobotCard } from './robot-card'

const NOW = new Date('2026-11-17T12:00:00Z').getTime()
const MINUTE = 60_000

describe('RobotCard', () => {
  afterEach(() => vi.useRealTimers())

  test('is an article named by its callsign heading', () => {
    render(<RobotCard robot={makeRobot({ callsign: 'Atlas' })} />)

    expect(screen.getByRole('article', { name: 'Atlas' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Atlas' })).toBeInTheDocument()
  })

  test('shows model and serial', () => {
    render(<RobotCard robot={makeRobot({ model: 'HX-6 Scout', serial: 'HX6S-0142' })} />)

    expect(screen.getByText(/HX-6 Scout/)).toBeInTheDocument()
    expect(screen.getByText(/HX6S-0142/)).toBeInTheDocument()
  })

  test('composes StatusBadge and BatteryMeter', () => {
    render(<RobotCard robot={makeRobot({ status: 'charging', battery: 38 })} />)

    expect(screen.getByText('Charging')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Battery' })).toHaveAttribute('aria-valuenow', '38')
  })

  test.each([
    ['idle', 'At base'],
    ['charging', 'At base'],
    ['on-mission', 'On mission'],
    ['holding', 'On mission'],
    ['returning', 'Returning to base'],
  ] as const)('a %s robot summarises as "%s"', (status, summary) => {
    render(<RobotCard robot={makeRobot({ status })} />)

    expect(screen.getByText(summary)).toBeInTheDocument()
  })

  test('an offline robot says when it was last seen', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)

    render(<RobotCard robot={makeRobot({ status: 'offline', lastSeen: NOW - 4 * MINUTE })} />)

    expect(screen.getByText(/last seen 4 min\.? ago/i)).toBeInTheDocument()
  })

  test('a faulted robot shows its fault reason', () => {
    const robot = makeRobot({ status: 'fault', faultReason: 'LM motor over-temperature' })
    render(<RobotCard robot={robot} />)

    expect(screen.getByText('LM motor over-temperature')).toBeInTheDocument()
  })

  // The brief says "only when status is fault": a leftover reason on a
  // recovered robot must not show.
  test('a stale fault reason is hidden when the robot is not faulted', () => {
    const robot = makeRobot({ status: 'idle', faultReason: 'LM motor over-temperature' })
    render(<RobotCard robot={robot} />)

    expect(screen.queryByText('LM motor over-temperature')).not.toBeInTheDocument()
  })

  test('renders whatever the parent puts in the actions slot', () => {
    render(<RobotCard robot={makeRobot()} actions={<button>Clear fault</button>} />)

    expect(screen.getByRole('button', { name: 'Clear fault' })).toBeInTheDocument()
  })

  test('renders no actions when none are given', () => {
    render(<RobotCard robot={makeRobot()} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
