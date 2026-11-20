import type { RobotStatus, Tone } from '../types'

// Full class names so Tailwind's source scanner can find them.
export const STATUS_TEXT_TONES: Record<Tone, string> = {
  idle: 'text-idle',
  live: 'text-live',
  caution: 'text-caution',
  ok: 'text-ok',
  danger: 'text-danger',
}
export const BATTERY_BG_TONES: Record<Tone, string> = {
  idle: 'bg-idle',
  live: 'bg-live',
  caution: 'bg-caution',
  ok: 'bg-ok',
  danger: 'bg-danger',
}
export const STATUS_SUMMARY_TEXT: Record<Exclude<RobotStatus, 'fault' | 'offline'>, string> = {
  idle: 'At base',
  charging: 'At base',
  'on-mission': 'On mission',
  holding: 'On mission',
  returning: 'Returning to base',
}
