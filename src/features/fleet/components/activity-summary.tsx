import { formatRelativeTime } from '@/lib/format'
import type { RobotStatus } from '../types'
import { STATUS_SUMMARY_TEXT } from './constants'

export function ActivitySummary({ status, lastSeen }: { status: RobotStatus; lastSeen: number }) {
  if (status === 'fault') return null
  return (
    <span>
      {status === 'offline'
        ? `Last seen ${formatRelativeTime(lastSeen)}`
        : STATUS_SUMMARY_TEXT[status]}
    </span>
  )
}
