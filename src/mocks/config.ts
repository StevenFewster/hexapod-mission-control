/**
 * Simulator configuration.
 *
 * Defaults are friendly for early chapters. You can override any value at runtime, without
 * touching code, from the browser console:
 *
 *   localStorage.setItem('hmc:sim', JSON.stringify({ errorRate: 0.2, latency: [800, 2000] }))
 *
 * then reload. `PATCH /api/sim/config` changes values live (chapter 13 builds a UI for it).
 */

export interface SimConfig {
  /** Random response delay range for REST calls, ms. */
  latency: [min: number, max: number]
  /** Probability (0–1) that a non-auth REST call fails with a 500. */
  errorRate: number
  /** When true, REST calls need `Authorization: Bearer <token>` and the live socket needs an `auth` message. Turned on in chapter 6. */
  requireAuth: boolean
  /** Real milliseconds between simulation ticks (telemetry rate). */
  tickMs: number
  /** Simulated seconds per real second. 2 = robots move twice as fast as real life. Try 10 for snappy demos. */
  timeScale: number
  /** Probability per robot per simulated minute of a random hardware fault. */
  faultRatePerMinute: number
  /** Minutes of history generated on start-up (telemetry history, recent events). Max 10. */
  warmupMinutes: number
  /** Seed for the deterministic parts of the world (robots, historical events). */
  seed: number
}

export const LIVE_URL = 'wss://live.hexapod.local/v1'

export const defaultConfig: SimConfig = {
  latency: [150, 600],
  errorRate: 0,
  requireAuth: false,
  tickMs: 500,
  timeScale: 2,
  faultRatePerMinute: 0.003,
  warmupMinutes: 5,
  seed: 6,
}

const STORAGE_KEY = 'hmc:sim'

/** Defaults merged with any overrides saved in localStorage (browser only; ignored elsewhere). */
export function loadConfig(): SimConfig {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return { ...defaultConfig }
    const overrides = JSON.parse(raw) as Partial<SimConfig>
    return { ...defaultConfig, ...overrides }
  } catch {
    return { ...defaultConfig }
  }
}

export function saveConfig(config: SimConfig): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Private mode, quota, or no localStorage (tests). Live config still applies.
  }
}
