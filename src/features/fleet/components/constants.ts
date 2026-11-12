import type { Tone } from './types'

// Full class names so Tailwind's source scanner can find them.
export const STATUS_TEXT_TONES: Record<Tone, string> = {
  idle: 'text-idle',
  live: 'text-live',
  caution: 'text-caution',
  ok: 'text-ok',
  danger: 'text-danger',
}
