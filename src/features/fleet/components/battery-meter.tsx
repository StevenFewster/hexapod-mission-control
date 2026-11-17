import { cn } from '@/lib/cn'
import { formatPercentage } from '@/lib/format'
import type { ComponentProps } from 'react'
import type { Tone } from './types'
import { BATTERY_BG_TONES } from './constants'

function getMeterColorAndStatus(level: number) {
  const status: Tone = level <= 20 ? 'danger' : level <= 40 ? 'caution' : 'ok'
  const meterColor = BATTERY_BG_TONES[status]
  return { meterColor, status }
}

export function BatteryMeter({
  level,
  className,
  ...rest
}: ComponentProps<'div'> & { level: number }) {
  const currentLevel = Math.ceil(level / 10)
  const { meterColor, status } = getMeterColorAndStatus(level)

  const meterLevels = Array.from({ length: 10 }, (_, i) =>
    i < currentLevel ? (
      <span data-filled="true" className={cn(meterColor, 'h-3 w-1.5 rounded-sm')} key={i} />
    ) : (
      <span data-filled="false" className="bg-border h-3 w-1.5 rounded-sm" key={i} />
    ),
  )

  return (
    <div
      role="meter"
      aria-label="Battery"
      aria-valuenow={level}
      aria-valuemin={0}
      aria-valuemax={100}
      data-tone={status}
      className={cn('flex flex-row gap-1', className)}
      {...rest}
    >
      <div className="flex gap-0.5">{meterLevels}</div>
      <span className="tabular-nums">{formatPercentage(level)}</span>
    </div>
  )
}
