import type { Robot } from '../types'

/**
 * Test-only factory: a valid idle robot at base, with any fields overridden.
 * Keeps each test focused on the one or two fields it cares about.
 */
export function makeRobot(overrides: Partial<Robot> = {}): Robot {
  const home = { lat: 51.5, lng: -0.12 }
  return {
    id: 'rb_atlas',
    callsign: 'Atlas',
    serial: 'HX6H-0007',
    model: 'HX-6 Heavy',
    status: 'idle',
    battery: 92,
    position: home,
    heading: 0,
    speed: 0,
    gait: 'tripod',
    firmware: '4.2.1',
    home,
    maxPayloadKg: 80,
    payloadKg: 0,
    missionId: null,
    faultReason: null,
    notes: '',
    lastSeen: Date.now(),
    ...overrides,
  }
}
