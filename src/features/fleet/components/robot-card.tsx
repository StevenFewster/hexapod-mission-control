import { useId } from 'react'
import type { Robot } from '../types'
import type { ComponentProps, ReactNode } from 'react'
import { BatteryMeter } from './battery-meter'
import { StatusBadge } from './status-badge'
import { ActivitySummary } from './activity-summary'
import { cn } from '@/lib/cn'

export function RobotCard({
  robot,
  className,
  actions,
  ...rest
}: ComponentProps<'article'> & { robot: Robot; actions?: ReactNode }) {
  const { status, faultReason, battery, callsign, model, serial, lastSeen } = robot
  const headingId = useId()
  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        'bg-surface border-border flex flex-col gap-3 rounded-lg border p-4',
        status === 'offline' && 'opacity-60',
        className,
      )}

      {...rest}
    >
      <header>
        <h3 id={headingId}>{callsign}</h3>
        <p className="text-text-muted font-mono">
          Model: {model} Serial: {serial}
        </p>
        <StatusBadge status={status} />
      </header>
      <BatteryMeter level={battery} />
      <ActivitySummary status={status} lastSeen={lastSeen} />
      {status === 'fault' && faultReason && <p className="text-danger">{faultReason}</p>}
      {actions}
    </article>
  )
}
