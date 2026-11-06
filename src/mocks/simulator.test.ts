/**
 * Tests for the simulated backend. These are "the backend team's" tests – they prove the
 * simulator behaves as docs/API.md says, so when your app misbehaves you know where to look.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createApi } from './api'
import { defaultConfig } from './config'
import { DEMO_PASSWORD } from './seed'
import type {
  CommandResult,
  FleetEvent,
  Mission,
  MissionInput,
  Page,
  Robot,
  ServerMessage,
} from './types'
import { World } from './world'

const NOW = Date.UTC(2026, 10, 6, 10, 0, 0)

function setup(overrides: Partial<typeof defaultConfig> = {}) {
  const world = new World(
    { ...defaultConfig, warmupMinutes: 2, faultRatePerMinute: 0, ...overrides },
    NOW,
  )
  const api = createApi(world)
  const call = (method: string, url: string, body?: unknown, token: string | null = null) => {
    const u = new URL(url, 'http://localhost')
    return api.handle({ method, path: u.pathname, query: u.searchParams, body, token })
  }
  const messages: ServerMessage[] = []
  world.subscribe((m) => messages.push(m))
  return { world, api, call, messages }
}

const missionInput = (overrides: Partial<MissionInput> = {}): MissionInput => ({
  name: 'Test sweep',
  robotId: 'rb_atlas',
  priority: 'normal',
  scheduledFor: null,
  notes: '',
  waypoints: [
    { position: { lat: 51.993, lng: -1.713 }, action: 'move' },
    { position: { lat: 51.994, lng: -1.712 }, action: 'scan' },
  ],
  ...overrides,
})

describe('seed world', () => {
  it('starts with six robots in a mix of states', () => {
    const { call } = setup()
    const res = call('GET', '/api/robots')
    expect(res.status).toBe(200)
    const robots = res.body as Robot[]
    expect(robots).toHaveLength(6)
    const statuses = new Set(robots.map((r) => r.status))
    for (const s of ['on-mission', 'fault', 'offline', 'charging', 'idle'])
      expect(statuses.has(s as Robot['status'])).toBe(true)
  })

  it('has two active missions and thousands of historical events', () => {
    const { call } = setup()
    const missions = call('GET', '/api/missions?status=active').body as Mission[]
    expect(missions).toHaveLength(2)
    const events = call('GET', '/api/events?limit=1').body as Page<FleetEvent>
    expect(events.total).toBeGreaterThan(5000)
  })

  it('has telemetry history from the warm-up, with six legs per frame', () => {
    const { call } = setup()
    const frames = call('GET', '/api/robots/rb_borealis/telemetry?minutes=10').body as Array<{
      legs: unknown[]
    }>
    expect(frames.length).toBeGreaterThan(100)
    expect(frames[0]!.legs).toHaveLength(6)
    const offline = call('GET', '/api/robots/rb_fenix/telemetry').body as unknown[]
    expect(offline).toHaveLength(0)
  })
})

describe('simulation', () => {
  it('moves robots that are on a mission and streams telemetry', () => {
    const { world, messages } = setup()
    const before = { ...world.robots.get('rb_borealis')!.position }
    world.advance(5_000)
    const after = world.robots.get('rb_borealis')!.position
    expect(after).not.toEqual(before)
    expect(messages.some((m) => m.type === 'telemetry' && m.frame.robotId === 'rb_borealis')).toBe(
      true,
    )
    expect(messages.some((m) => m.type === 'telemetry' && m.frame.robotId === 'rb_fenix')).toBe(
      false,
    )
  })

  it('brings the offline robot back after 90 seconds', () => {
    const { world } = setup()
    world.advance(80_000)
    expect(world.robots.get('rb_fenix')!.status).toBe('offline')
    world.advance(15_000)
    expect(world.robots.get('rb_fenix')!.status).toBe('idle')
  })

  it('broadcasts clones, so listeners cannot mutate the world', () => {
    const { world, messages } = setup()
    world.advance(1_000)
    const frame = messages.find((m) => m.type === 'telemetry')
    if (frame?.type !== 'telemetry') throw new Error('expected a telemetry message')
    frame.frame.position.lat = 0
    expect(world.robots.get(frame.frame.robotId)!.position.lat).not.toBe(0)
  })
})

describe('commands', () => {
  it('are pending at first, then accepted on the live channel', () => {
    const { world, call, messages } = setup()
    const res = call('POST', '/api/robots/rb_borealis/commands', { type: 'stop' })
    expect(res.status).toBe(202)
    expect((res.body as CommandResult).status).toBe('pending')
    world.advance(1_000)
    const ack = messages.find((m) => m.type === 'command')
    expect(ack?.type === 'command' && ack.command.status).toBe('accepted')
    expect(world.robots.get('rb_borealis')!.status).toBe('holding')
  })

  it('rejects clear-fault while the motor is hot, accepts it once cool', () => {
    const { world, call, messages } = setup()
    call('POST', '/api/robots/rb_echo/commands', { type: 'clear-fault' })
    world.advance(1_000)
    const first = messages.filter((m) => m.type === 'command').at(-1)
    expect(first?.type === 'command' && first.command.status).toBe('rejected')
    expect(first?.type === 'command' && first.command.reason).toMatch(/still hot/)

    world.advance(120_000)
    call('POST', '/api/robots/rb_echo/commands', { type: 'clear-fault' })
    world.advance(1_000)
    const second = messages.filter((m) => m.type === 'command').at(-1)
    expect(second?.type === 'command' && second.command.status).toBe('accepted')
    expect(world.robots.get('rb_echo')!.status).toBe('idle')
  })

  it('validates the command body', () => {
    const { call } = setup()
    expect(call('POST', '/api/robots/rb_atlas/commands', { type: 'dance' }).status).toBe(422)
    expect(call('POST', '/api/robots/rb_atlas/commands', { type: 'set-gait' }).status).toBe(422)
    expect(call('POST', '/api/robots/nope/commands', { type: 'stop' }).status).toBe(404)
  })
})

describe('missions', () => {
  it('creates a draft, starts it, and the robot sets off', () => {
    const { world, call } = setup()
    const created = call('POST', '/api/missions', missionInput())
    expect(created.status).toBe(201)
    const mission = created.body as Mission
    expect(mission.status).toBe('draft')
    expect(mission.waypoints[0]!.id).toBeTruthy()

    const started = call('POST', `/api/missions/${mission.id}/start`)
    expect(started.status).toBe(200)
    expect(world.robots.get('rb_atlas')!.status).toBe('on-mission')
    world.advance(3_000)
    expect(world.robots.get('rb_atlas')!.speed).toBeGreaterThan(0)
  })

  it('returns field errors keyed by path', () => {
    const { call } = setup()
    const res = call(
      'POST',
      '/api/missions',
      missionInput({
        name: 'x',
        robotId: 'rb_borealis', // a Scout: max 40 kg
        waypoints: [
          { position: { lat: 51.993, lng: -1.713 }, action: 'lift', liftKg: 100 },
          { position: { lat: 52.5, lng: -1.7 }, action: 'hold' },
        ],
      }),
    )
    expect(res.status).toBe(422)
    const fieldErrors = (res.body as { error: { fieldErrors: Record<string, string> } }).error
      .fieldErrors
    expect(fieldErrors.name).toBeTruthy()
    expect(fieldErrors['waypoints.0.liftKg']).toMatch(/at most 40 kg/)
    expect(fieldErrors['waypoints.1.position']).toMatch(/operating area/)
    expect(fieldErrors['waypoints.1.holdSeconds']).toBeTruthy()
  })

  it('refuses to start a mission when the robot is busy', () => {
    const { call } = setup()
    const mission = call('POST', '/api/missions', missionInput({ robotId: 'rb_borealis' }))
      .body as Mission
    const res = call('POST', `/api/missions/${mission.id}/start`)
    expect(res.status).toBe(409)
  })

  it('only lets drafts and scheduled missions be edited', () => {
    const { call } = setup()
    expect(call('PATCH', '/api/missions/ms_sweep_b', { name: 'Renamed' }).status).toBe(409)
    const res = call('PATCH', '/api/missions/ms_night_thermal', { name: 'Renamed draft' })
    expect(res.status).toBe(200)
    expect((res.body as Mission).name).toBe('Renamed draft')
  })
})

describe('events', () => {
  let ctx: ReturnType<typeof setup>
  beforeEach(() => {
    ctx = setup()
  })

  it('pages newest-first with a stable cursor', () => {
    const page1 = ctx.call('GET', '/api/events?limit=50').body as Page<FleetEvent>
    expect(page1.items).toHaveLength(50)
    expect(page1.items[0]!.ts).toBeGreaterThanOrEqual(page1.items[49]!.ts)

    // New events arriving between pages must not shift page 2.
    ctx.world.log('info', 'system', 'TEST', 'new event', null)
    const page2 = ctx.call('GET', `/api/events?limit=50&cursor=${page1.nextCursor}`)
      .body as Page<FleetEvent>
    const ids1 = new Set(page1.items.map((e) => e.id))
    expect(page2.items.some((e) => ids1.has(e.id))).toBe(false)
    expect(page2.items[0]!.ts).toBeLessThanOrEqual(page1.items[49]!.ts)
  })

  it('filters by level and acknowledgement, and bulk-acknowledges', () => {
    const unacked = ctx.call(
      'GET',
      '/api/events?level=warning,error,critical&acknowledged=false&limit=10',
    ).body as Page<FleetEvent>
    expect(unacked.items.length).toBeGreaterThan(0)
    expect(
      unacked.items.every(
        (e) => !e.acknowledged && ['warning', 'error', 'critical'].includes(e.level),
      ),
    ).toBe(true)

    const res = ctx.call('POST', '/api/events/acknowledge', { ids: unacked.items.map((e) => e.id) })
    expect(res.body).toEqual({ updated: unacked.items.length })
    const after = ctx.call(
      'GET',
      '/api/events?level=warning,error,critical&acknowledged=false&limit=10',
    ).body as Page<FleetEvent>
    expect(after.total).toBe(unacked.total - unacked.items.length)
  })
})

describe('auth', () => {
  it('is off by default', () => {
    const { call } = setup()
    expect(call('GET', '/api/robots').status).toBe(200)
  })

  it('when on, requires a token and enforces roles', () => {
    const { call } = setup({ requireAuth: true })
    expect(call('GET', '/api/robots').status).toBe(401)

    expect(
      call('POST', '/api/auth/login', { email: 'observer@hexapod.dev', password: 'wrong' }).status,
    ).toBe(401)
    const login = call('POST', '/api/auth/login', {
      email: 'observer@hexapod.dev',
      password: DEMO_PASSWORD,
    })
    expect(login.status).toBe(200)
    const { token } = login.body as { token: string }

    expect(call('GET', '/api/robots', undefined, token).status).toBe(200)
    expect(call('GET', '/api/auth/me', undefined, token).status).toBe(200)
    expect(call('POST', '/api/robots/rb_atlas/commands', { type: 'stop' }, token).status).toBe(403)

    call('POST', '/api/sim/expire-sessions')
    expect(call('GET', '/api/robots', undefined, token).status).toBe(401)
  })
})
