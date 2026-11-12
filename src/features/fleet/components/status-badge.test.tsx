import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { RobotStatus } from './types'
import { StatusBadge } from './status-badge'

test.each([
  ['idle', 'Idle', 'text-idle'],
  ['on-mission', 'On Mission', 'text-live'],
  ['holding', 'Holding', 'text-caution'],
  ['returning', 'Returning', 'text-live'],
  ['charging', 'Charging', 'text-ok'],
  ['fault', 'Fault', 'text-danger'],
  ['offline', 'Offline', 'text-idle'],
] satisfies [RobotStatus, string, string][])(
  'renders %s with its label and semantic color',
  (status, label, cls) => {
    render(<StatusBadge status={status} />)

    expect(screen.getByText(label)).toHaveClass(`inline-flex items-center gap-1 ${cls}`)
  },
)

test('forwards span props and merges caller classes', () => {
  render(<StatusBadge status="idle" title="Robot status" className="font-bold" />)

  expect(screen.getByTitle('Robot status')).toHaveClass('text-idle', 'font-bold')
})
