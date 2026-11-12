import type { ComponentProps } from 'react'
import type { RobotStatus, Tone } from './types'
import { Circle, House, Pause, Play, TriangleAlert, WifiOff, Zap } from 'lucide-react'
import { cn } from '@/lib/cn'
import { STATUS_TEXT_TONES } from './constants'

const statusDisplay = {
  idle: { label: 'Idle', icon: Circle, tone: 'idle' },
  'on-mission': { label: 'On Mission', icon: Play, tone: 'live' },
  holding: { label: 'Holding', icon: Pause, tone: 'caution' },
  returning: { label: 'Returning', icon: House, tone: 'live' },
  charging: { label: 'Charging', icon: Zap, tone: 'ok' },
  fault: { label: 'Fault', icon: TriangleAlert, tone: 'danger' },
  offline: { label: 'Offline', icon: WifiOff, tone: 'idle' },
} satisfies Record<RobotStatus, { label: string; icon: typeof Circle; tone: Tone }>

export function StatusBadge({
  status,
  className,
  ...rest
}: ComponentProps<'span'> & { status: RobotStatus }) {
  const { label, icon: Icon, tone } = statusDisplay[status]

  return (
    <span
      className={cn('inline-flex', 'items-center', 'gap-1', STATUS_TEXT_TONES[tone], className)}
      data-tone={tone}
      {...rest}
    >
      <Icon aria-hidden="true" size={16} className="size-4 shrink-0" />
      {label}
    </span>
  )
}
