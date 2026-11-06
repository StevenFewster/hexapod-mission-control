/**
 * The starting state of the world. Deterministic for a given seed, so screenshots and tests are
 * stable. The site is a fictional search-and-rescue training ground in the Cotswolds, UK.
 */
import type {
  Detection,
  DetectionKind,
  EventLevel,
  EventSource,
  FleetEvent,
  LatLng,
  Mission,
  Robot,
  User,
  Waypoint,
  WaypointAction,
} from './types'
import { between, createRng, offsetM, pick, round } from './util'

export const BASE: LatLng = { lat: 51.9925, lng: -1.7135 }

/** Waypoints further than this from BASE are rejected by the API. */
export const OPERATING_RADIUS_M = 5_000

export const DEMO_PASSWORD = 'mission-control'

export const USERS: User[] = [
  { id: 'u_commander', name: 'Alex Morgan', email: 'commander@hexapod.dev', role: 'commander' },
  { id: 'u_operator', name: 'Sam Okafor', email: 'operator@hexapod.dev', role: 'operator' },
  { id: 'u_observer', name: 'Jo Lindqvist', email: 'observer@hexapod.dev', role: 'observer' },
]

export const MODEL_SPECS = {
  'HX-6 Scout': { maxSpeed: 1.4, maxPayloadKg: 40 },
  'HX-6 Heavy': { maxSpeed: 0.7, maxPayloadKg: 250 },
} as const

export interface Seed {
  robots: Robot[]
  missions: Mission[]
  events: FleetEvent[]
  detections: Detection[]
}

const DAY = 86_400_000

export function createSeed(seed: number, now: number): Seed {
  const rng = createRng(seed)
  const at = (bearing: number, meters: number) => offsetM(BASE, bearing, meters)
  // Slightly different docking spots so markers don't overlap.
  const dock = (i: number) => offsetM(BASE, i * 60, 6)

  const robot = (
    r: Partial<Robot> & Pick<Robot, 'id' | 'callsign' | 'serial' | 'model'>,
  ): Robot => {
    const home = r.home ?? BASE
    return {
      status: 'idle',
      battery: 100,
      position: home,
      heading: 0,
      speed: 0,
      gait: 'tripod',
      firmware: '4.2.1',
      maxPayloadKg: MODEL_SPECS[r.model].maxPayloadKg,
      payloadKg: 0,
      missionId: null,
      faultReason: null,
      notes: '',
      lastSeen: now,
      ...r,
      home,
    }
  }

  const robots: Robot[] = [
    robot({
      id: 'rb_atlas',
      callsign: 'Atlas',
      serial: 'HX6H-0007',
      model: 'HX-6 Heavy',
      battery: 92,
      home: dock(0),
      notes: 'Primary heavy-lift unit.',
    }),
    robot({
      id: 'rb_borealis',
      callsign: 'Borealis',
      serial: 'HX6S-0142',
      model: 'HX-6 Scout',
      battery: 71,
      home: dock(1),
      status: 'on-mission',
      missionId: 'ms_sweep_b',
      position: at(40, 180),
      heading: 40,
    }),
    robot({
      id: 'rb_cygnus',
      callsign: 'Cygnus',
      serial: 'HX6S-0151',
      model: 'HX-6 Scout',
      battery: 38,
      home: dock(2),
      status: 'charging',
    }),
    robot({
      id: 'rb_draco',
      callsign: 'Draco',
      serial: 'HX6H-0011',
      model: 'HX-6 Heavy',
      battery: 84,
      home: dock(3),
      status: 'on-mission',
      missionId: 'ms_rail',
      position: at(200, 120),
      heading: 200,
      gait: 'ripple',
    }),
    robot({
      id: 'rb_echo',
      callsign: 'Echo',
      serial: 'HX6S-0163',
      model: 'HX-6 Scout',
      battery: 54,
      home: dock(4),
      status: 'fault',
      faultReason: 'LM motor over-temperature',
      position: at(300, 260),
      heading: 300,
      firmware: '4.1.9',
    }),
    robot({
      id: 'rb_fenix',
      callsign: 'Fenix',
      serial: 'HX6S-0170',
      model: 'HX-6 Scout',
      battery: 66,
      home: dock(5),
      status: 'offline',
      position: at(120, 410),
      heading: 120,
      lastSeen: now - 4 * 60_000,
      notes: 'Intermittent radio. Check antenna mount.',
    }),
  ]

  let wpCounter = 0
  const wp = (
    bearing: number,
    meters: number,
    action: WaypointAction,
    extra: Partial<Waypoint> = {},
  ): Waypoint => ({
    id: `wp_${++wpCounter}`,
    position: at(bearing, meters),
    action,
    ...extra,
  })

  const mission = (m: Partial<Mission> & Pick<Mission, 'id' | 'name' | 'waypoints'>): Mission => ({
    robotId: null,
    status: 'draft',
    priority: 'normal',
    scheduledFor: null,
    currentWaypointIndex: -1,
    notes: '',
    createdBy: 'u_commander',
    createdAt: now - 2 * DAY,
    updatedAt: now - 2 * DAY,
    startedAt: null,
    completedAt: null,
    ...m,
  })

  const missions: Mission[] = [
    mission({
      id: 'ms_sweep_b',
      name: 'Collapsed structure sweep – Sector B',
      robotId: 'rb_borealis',
      status: 'active',
      priority: 'high',
      currentWaypointIndex: 1,
      startedAt: now - 25 * 60_000,
      createdAt: now - 3 * 3_600_000,
      updatedAt: now - 25 * 60_000,
      notes: 'Reported voices near the north stairwell. Scan every void.',
      waypoints: [
        wp(40, 150, 'move', { label: 'Entry point' }),
        wp(45, 300, 'scan', { label: 'North stairwell' }),
        wp(30, 450, 'scan', { label: 'Lift shaft' }),
        wp(55, 560, 'hold', { holdSeconds: 45, label: 'Structural check' }),
        wp(70, 650, 'scan', { label: 'East wing void' }),
        wp(85, 520, 'scan', { label: 'Basement access' }),
        wp(100, 380, 'scan', { label: 'Loading bay' }),
        wp(60, 80, 'move', { label: 'Exit' }),
      ],
    }),
    mission({
      id: 'ms_rail',
      name: 'Debris clearance – rail incident',
      robotId: 'rb_draco',
      status: 'active',
      priority: 'critical',
      currentWaypointIndex: 1,
      startedAt: now - 12 * 60_000,
      createdAt: now - 3_600_000,
      updatedAt: now - 12 * 60_000,
      waypoints: [
        wp(200, 150, 'move', { label: 'Track access' }),
        wp(205, 330, 'lift', { liftKg: 120, label: 'Carriage panel' }),
        wp(210, 420, 'scan', { label: 'Under carriage' }),
        wp(220, 560, 'lift', { liftKg: 180, label: 'Fallen beam' }),
        wp(230, 640, 'scan', { label: 'Signal box' }),
        wp(200, 40, 'move', { label: 'Return' }),
      ],
    }),
    mission({
      id: 'ms_perimeter',
      name: 'Perimeter acoustic survey',
      robotId: 'rb_atlas',
      status: 'scheduled',
      scheduledFor: now + 26 * 3_600_000,
      createdAt: now - 5 * 3_600_000,
      updatedAt: now - 5 * 3_600_000,
      createdBy: 'u_operator',
      waypoints: [0, 60, 120, 180, 240, 300].map((b) =>
        wp(b, 600, 'scan', { label: `Perimeter ${b}°` }),
      ),
    }),
    mission({
      id: 'ms_night_thermal',
      name: 'Night thermal scan – flood zone',
      priority: 'low',
      createdBy: 'u_operator',
      notes: 'Draft – waiting for water levels to drop.',
      waypoints: [wp(150, 800, 'move'), wp(155, 950, 'scan'), wp(160, 1100, 'scan')],
    }),
  ]

  // Historical missions.
  const historicNames = [
    'Tunnel collapse drill',
    'Warehouse fire search',
    'Landslip assessment',
    'Night search – woodland',
    'Rubble field mapping',
    'Hazmat leak survey',
    'Bridge inspection',
    'Multi-storey car park sweep',
  ]
  historicNames.forEach((name, i) => {
    const started = now - (i + 1) * 1.6 * DAY - between(rng, 0, DAY / 2)
    const aborted = i % 4 === 3
    const r = pick(rng, robots)
    const count = 3 + Math.floor(rng() * 5)
    missions.push(
      mission({
        id: `ms_hist_${i + 1}`,
        name,
        robotId: r.id,
        status: aborted ? 'aborted' : 'completed',
        priority: pick(rng, ['low', 'normal', 'normal', 'high'] as const),
        currentWaypointIndex: aborted ? Math.floor(count / 2) : count - 1,
        createdAt: started - 3_600_000,
        updatedAt: started + 40 * 60_000,
        startedAt: started,
        completedAt: started + 40 * 60_000,
        notes: aborted ? 'Aborted: weather.' : '',
        waypoints: Array.from({ length: count }, (_, k) =>
          wp(
            between(rng, 0, 360),
            between(rng, 80, 900),
            pick(rng, ['move', 'scan', 'scan', 'hold'] as const),
            k === 0 ? { label: 'Start' } : {},
          ),
        ).map((w) => (w.action === 'hold' ? { ...w, holdSeconds: 20 } : w)),
      }),
    )
  })

  // Historical log: ~5,000 events over 14 days, newest last.
  const events: FleetEvent[] = []
  const templates: Array<[EventLevel, EventSource, string, (callsign: string) => string, number]> =
    [
      [
        'debug',
        'comms',
        'LINK_RTT',
        (c) => `${c}: link round-trip ${Math.round(between(rng, 20, 180))} ms`,
        18,
      ],
      ['info', 'system', 'HEARTBEAT', (c) => `${c}: heartbeat OK`, 14],
      ['info', 'nav', 'WAYPOINT_REACHED', (c) => `${c}: waypoint reached`, 12],
      ['info', 'mission', 'MISSION_STARTED', (c) => `${c}: mission started`, 3],
      ['info', 'mission', 'MISSION_COMPLETED', (c) => `${c}: mission completed`, 3],
      ['info', 'battery', 'CHARGE_COMPLETE', (c) => `${c}: charge complete`, 3],
      [
        'info',
        'system',
        'GAIT_CHANGED',
        (c) => `${c}: gait set to ${pick(rng, ['tripod', 'ripple', 'wave'])}`,
        4,
      ],
      ['warning', 'battery', 'BATTERY_LOW', (c) => `${c}: battery below 20%`, 4],
      [
        'warning',
        'motor',
        'MOTOR_TEMP_HIGH',
        (c) =>
          `${c}: ${pick(rng, ['LF', 'LM', 'LR', 'RF', 'RM', 'RR'])} motor at ${Math.round(between(rng, 70, 84))}°C`,
        5,
      ],
      [
        'warning',
        'comms',
        'SIGNAL_WEAK',
        (c) => `${c}: signal weak (${Math.round(between(rng, 8, 25))}%)`,
        6,
      ],
      ['warning', 'nav', 'PATH_BLOCKED', (c) => `${c}: path blocked, re-planning`, 3],
      [
        'error',
        'motor',
        'MOTOR_STALL',
        (c) => `${c}: ${pick(rng, ['LF', 'LM', 'LR', 'RF', 'RM', 'RR'])} motor stalled`,
        1.5,
      ],
      ['error', 'sensor', 'LIDAR_DEGRADED', (c) => `${c}: lidar returns degraded (dust)`, 1.5],
      ['error', 'comms', 'LINK_LOST', (c) => `${c}: link lost`, 1],
      [
        'critical',
        'battery',
        'BATTERY_CRITICAL',
        (c) => `${c}: battery critical – returning to base`,
        0.4,
      ],
      [
        'critical',
        'motor',
        'MOTOR_OVERTEMP',
        (c) => `${c}: motor over-temperature – motors disabled`,
        0.3,
      ],
    ]
  const totalWeight = templates.reduce((sum, t) => sum + t[4], 0)
  const COUNT = 5_000
  const start = now - 14 * DAY
  for (let i = 0; i < COUNT; i++) {
    let roll = rng() * totalWeight
    let template = templates[0]!
    for (const t of templates) {
      roll -= t[4]
      if (roll <= 0) {
        template = t
        break
      }
    }
    const [level, source, code, message] = template
    const r = pick(rng, robots)
    const ts = Math.round(start + (i / COUNT) * (14 * DAY - 10 * 60_000) + between(rng, 0, 60_000))
    const old = ts < now - DAY
    const needsAck = level === 'warning' || level === 'error' || level === 'critical'
    events.push({
      id: `ev_h${i.toString().padStart(5, '0')}`,
      ts,
      robotId: r.id,
      level,
      source,
      code,
      message: message(r.callsign),
      acknowledged: needsAck ? old || rng() < 0.3 : true,
      acknowledgedBy: needsAck && old ? pick(rng, USERS).id : null,
    })
  }

  const kinds: DetectionKind[] = ['thermal', 'acoustic', 'co2', 'visual']
  const detections: Detection[] = Array.from({ length: 9 }, (_, i) => {
    const m = missions[4 + (i % 8)]!
    return {
      id: `dt_h${i + 1}`,
      ts: (m.startedAt ?? now) + between(rng, 5, 35) * 60_000,
      robotId: m.robotId ?? 'rb_borealis',
      missionId: m.id,
      position: at(between(rng, 0, 360), between(rng, 100, 900)),
      kind: pick(rng, kinds),
      confidence: round(between(rng, 0.35, 0.97)),
      status: i < 6 ? pick(rng, ['confirmed', 'dismissed'] as const) : 'unconfirmed',
      notes: '',
    }
  })

  return { robots, missions, events, detections }
}
