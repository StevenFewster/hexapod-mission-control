/**
 * The simulated world: robots walking missions, batteries draining, motors heating up, faults,
 * detections and a log of everything that happens. Framework-free so it can be unit tested and
 * driven by MSW in the browser.
 *
 * You don't need to read this to do the course – docs/API.md describes the behaviour – but it's
 * here if you're curious how the "backend" works.
 */
import type { SimConfig } from './config'
import { MODEL_SPECS, createSeed } from './seed'
import type {
  CommandRequest,
  CommandResult,
  Detection,
  EventLevel,
  EventSource,
  FleetEvent,
  Gait,
  LatLng,
  LegId,
  LegState,
  Mission,
  Robot,
  RobotStatus,
  ServerMessage,
  TelemetryFrame,
  WaypointAction,
} from './types'
import {
  approach,
  bearingDeg,
  between,
  clamp,
  createRng,
  distanceM,
  headingDelta,
  makeId,
  offsetM,
  pick,
  round,
} from './util'

export type Listener = (message: ServerMessage) => void
export type ControlSignal = { type: 'drop-connections' }
export type TriggerKind = 'fault' | 'low-battery' | 'detection' | 'offline' | 'disconnect'

export const LEG_IDS: readonly LegId[] = ['LF', 'LM', 'LR', 'RF', 'RM', 'RR']

const GAITS: Record<
  Gait,
  { duty: number; speedFactor: number; stepHz: number; offsets: number[] }
> = {
  tripod: { duty: 0.5, speedFactor: 1, stepHz: 1.2, offsets: [0, 0.5, 0, 0.5, 0, 0.5] },
  ripple: {
    duty: 0.67,
    speedFactor: 0.75,
    stepHz: 1.0,
    offsets: [0, 1 / 3, 2 / 3, 0.5, 5 / 6, 1 / 6],
  },
  wave: {
    duty: 0.83,
    speedFactor: 0.5,
    stepHz: 0.8,
    offsets: [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6],
  },
}

/** Simulated seconds spent working at a waypoint. `hold` uses the waypoint's holdSeconds. */
const WORK_SECONDS: Record<WaypointAction, number> = { move: 0, scan: 40, lift: 30, hold: 0 }

const MAX_FRAMES_PER_ROBOT = 1_200 // 10 minutes at the default 500 ms tick
const MAX_EVENTS = 20_000
const AMBIENT_C = 24

interface Internal {
  gaitPhase: number
  stepHz: number
  legTemps: number[]
  /** Extra target temperature per leg – how faults are injected. */
  legBias: number[]
  working: boolean
  workRemaining: number
  /** What to go back to after `holding`. */
  resumeStatus: RobotStatus | null
  offlineUntil: number | null
  /** One-shot warnings already sent (cleared when the condition recovers). */
  warned: Set<string>
}

interface PendingCommand {
  result: CommandResult
  request: CommandRequest
  resolveAt: number
}

export class World {
  config: SimConfig
  now: number
  robots = new Map<string, Robot>()
  missions = new Map<string, Mission>()
  /** Oldest first. */
  events: FleetEvent[] = []
  detections = new Map<string, Detection>()
  telemetry = new Map<string, TelemetryFrame[]>()
  /** token → user id */
  sessions = new Map<string, string>()

  private internal = new Map<string, Internal>()
  private pending: PendingCommand[] = []
  private listeners = new Set<Listener>()
  private controlListeners = new Set<(signal: ControlSignal) => void>()
  private timer: ReturnType<typeof setInterval> | null = null
  private lastTick: number
  private warming = false
  /** Next time a routine debug/info message is logged, so the live log never looks dead. */
  private chatterAt = 0
  private rng: () => number
  /** Separate stream for random faults so they don't depend on how much noise was generated. */
  private faultRng: () => number

  constructor(config: SimConfig, now = Date.now()) {
    this.config = config
    this.now = now
    this.lastTick = now
    this.rng = createRng(config.seed * 7919)
    this.faultRng = createRng(config.seed * 104_729 + 82)
    this.reset(now)
  }

  // --- Lifecycle --------------------------------------------------------------------------------

  /** Rebuild the world from the seed and fast-forward through the warm-up period. */
  reset(now = Date.now()): void {
    const seed = createSeed(this.config.seed, now)
    this.rng = createRng(this.config.seed * 7919)
    this.faultRng = createRng(this.config.seed * 104_729 + 82)
    this.robots = new Map(seed.robots.map((r) => [r.id, r]))
    this.missions = new Map(seed.missions.map((m) => [m.id, m]))
    this.events = seed.events
    this.detections = new Map(seed.detections.map((d) => [d.id, d]))
    this.telemetry = new Map(seed.robots.map((r) => [r.id, []]))
    this.pending = []
    this.chatterAt = 0
    this.internal = new Map(
      seed.robots.map((r) => [
        r.id,
        {
          gaitPhase: 0,
          stepHz: 0,
          legTemps: LEG_IDS.map(() => 30),
          legBias: LEG_IDS.map(() => 0),
          working: false,
          workRemaining: 0,
          resumeStatus: null,
          offlineUntil: null,
          warned: new Set<string>(),
        },
      ]),
    )

    // Warm up in real time (timeScale 1) so there is telemetry history and recent events.
    const warmupMs = clamp(this.config.warmupMinutes, 0, 10) * 60_000
    const tickMs = Math.max(50, this.config.tickMs)
    this.warming = true
    this.lastTick = now - warmupMs
    for (let t = now - warmupMs + tickMs; t <= now; t += tickMs) this.tick(t)
    this.warming = false
    this.lastTick = now
    this.now = now

    // Scripted situations that should be live when the app opens.
    const echo = this.internal.get('rb_echo')
    if (echo) echo.legTemps[1] = 86 // still too hot to clear for about a minute
    const fenix = this.internal.get('rb_fenix')
    if (fenix) fenix.offlineUntil = now + 90_000 // comes back online after 90 s

    this.emitControl({ type: 'drop-connections' })
  }

  start(): void {
    this.stop()
    this.lastTick = Date.now()
    this.timer = setInterval(() => this.tick(Date.now()), this.config.tickMs)
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  /** Run the clock forward by `ms` of real time in tick-sized steps. Handy in tests. */
  advance(ms: number): void {
    const step = Math.max(50, this.config.tickMs)
    const end = this.now + ms
    for (let t = this.now + step; t <= end; t += step) this.tick(t)
    if (this.now < end) this.tick(end)
  }

  get running(): boolean {
    return this.timer !== null
  }

  /** Apply a config change; restarts the clock if the tick rate changed. */
  updateConfig(patch: Partial<SimConfig>): SimConfig {
    const tickChanged = patch.tickMs !== undefined && patch.tickMs !== this.config.tickMs
    this.config = { ...this.config, ...patch }
    if (tickChanged && this.running) this.start()
    return this.config
  }

  // --- Subscriptions ------------------------------------------------------------------------------

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onControl(listener: (signal: ControlSignal) => void): () => void {
    this.controlListeners.add(listener)
    return () => this.controlListeners.delete(listener)
  }

  private broadcast(message: ServerMessage): void {
    if (this.warming) return
    for (const listener of this.listeners) listener(structuredClone(message))
  }

  private emitControl(signal: ControlSignal): void {
    for (const listener of this.controlListeners) listener(signal)
  }

  // --- The clock ----------------------------------------------------------------------------------

  tick(now = Date.now()): void {
    const realDtMs = now - this.lastTick
    if (realDtMs <= 0) return
    this.lastTick = now
    this.now = now
    const realDt = realDtMs / 1000
    const dt = realDt * (this.warming ? 1 : this.config.timeScale)

    this.processCommands(now)
    this.startDueMissions(now)
    for (const robot of this.robots.values()) this.stepRobot(robot, dt, realDt)
    this.chatter(now)
  }

  private chatter(now: number): void {
    if (now < this.chatterAt) return
    this.chatterAt = now + between(this.rng, 6_000, 20_000)
    const online = [...this.robots.values()].filter((r) => r.status !== 'offline')
    if (online.length === 0) return
    const robot = pick(this.rng, online)
    if (this.rng() < 0.7) {
      this.log(
        'debug',
        'comms',
        'LINK_RTT',
        `${robot.callsign}: link round-trip ${Math.round(between(this.rng, 20, 180))} ms`,
        robot.id,
      )
    } else {
      this.log('info', 'system', 'HEARTBEAT', `${robot.callsign}: heartbeat OK`, robot.id)
    }
  }

  private stepRobot(robot: Robot, dt: number, realDt: number): void {
    const s = this.state(robot.id)
    const before = robotKey(robot)
    const spec = MODEL_SPECS[robot.model]
    const gait = GAITS[robot.gait]

    if (robot.status === 'offline') {
      if (s.offlineUntil !== null && this.now >= s.offlineUntil) {
        s.offlineUntil = null
        robot.status = robot.missionId ? 'holding' : 'idle'
        s.resumeStatus = robot.missionId ? 'on-mission' : null
        robot.lastSeen = this.now
        this.log('info', 'comms', 'LINK_RESTORED', `${robot.callsign}: link restored`, robot.id)
      }
      if (robotKey(robot) !== before) this.broadcast({ type: 'robot', robot })
      return
    }

    // 1. Work out where we're heading.
    const mission = robot.missionId ? this.missions.get(robot.missionId) : undefined
    let target: LatLng | null = null
    if (robot.status === 'on-mission' && mission && !s.working) {
      target = mission.waypoints[mission.currentWaypointIndex]?.position ?? null
    } else if (robot.status === 'returning') {
      target = robot.home
    }
    if (robot.battery <= 0) target = null

    // 2. Move.
    const maxSpeed =
      spec.maxSpeed * gait.speedFactor * (1 - (0.3 * robot.payloadKg) / robot.maxPayloadKg)
    let arrived = false
    if (target) {
      const distance = distanceM(robot.position, target)
      const desired = bearingDeg(robot.position, target)
      const turn = clamp(headingDelta(robot.heading, desired), -90 * dt, 90 * dt)
      robot.heading = (robot.heading + turn + 360) % 360
      const step = maxSpeed * dt
      if (distance <= step) {
        robot.position = { ...target }
        robot.speed = round(distance / Math.max(dt, 0.001))
        arrived = true
      } else {
        robot.position = offsetM(robot.position, desired, step)
        robot.speed = round(maxSpeed)
      }
    } else {
      robot.speed = 0
    }

    if (arrived && robot.status === 'returning') {
      robot.status = robot.battery < 95 ? 'charging' : 'idle'
      this.log('info', 'nav', 'ARRIVED_HOME', `${robot.callsign}: arrived at base`, robot.id)
    } else if (arrived && mission) {
      this.arriveAtWaypoint(robot, mission, s)
    }

    // 3. Work at the current waypoint.
    if (s.working && robot.status === 'on-mission' && mission) {
      s.workRemaining -= dt
      if (s.workRemaining <= 0) this.finishWork(robot, mission, s)
    }

    // 4. Battery.
    if (robot.status === 'charging') {
      robot.battery = Math.min(100, robot.battery + 0.05 * dt)
      if (robot.battery >= 100) {
        robot.status = 'idle'
        this.log(
          'info',
          'battery',
          'CHARGE_COMPLETE',
          `${robot.callsign}: charge complete`,
          robot.id,
        )
      }
    } else {
      const drain = 0.0008 + 0.005 * (robot.speed / spec.maxSpeed) + 0.00004 * robot.payloadKg
      robot.battery = Math.max(0, robot.battery - drain * dt)
    }
    this.checkBattery(robot, s)

    // 5. Motor temperatures, random faults.
    const moving = robot.speed > 0.05
    if (moving && this.faultRng() < (this.config.faultRatePerMinute * dt) / 60) {
      const leg = Math.floor(this.faultRng() * LEG_IDS.length)
      s.legBias[leg] = 65
    }
    const rate = robot.status === 'fault' ? 0.25 : 0.4
    s.legTemps = s.legTemps.map((temp, k) => {
      const target =
        AMBIENT_C +
        4 +
        22 * (robot.speed / spec.maxSpeed) +
        robot.payloadKg * 0.06 +
        (s.legBias[k] ?? 0)
      return approach(temp, target, rate * dt)
    })
    this.checkTemperatures(robot, s)

    // 6. Gait animation (real time, so it looks right whatever the timeScale).
    s.stepHz = moving
      ? round(gait.stepHz * Math.min(1, robot.speed / (spec.maxSpeed * gait.speedFactor)), 3)
      : 0
    s.gaitPhase = (s.gaitPhase + s.stepHz * realDt) % 1

    // 7. Telemetry.
    robot.lastSeen = this.now
    const frame = this.frame(robot, s)
    const buffer = this.telemetry.get(robot.id)
    if (buffer) {
      buffer.push(frame)
      if (buffer.length > MAX_FRAMES_PER_ROBOT)
        buffer.splice(0, buffer.length - MAX_FRAMES_PER_ROBOT)
    }
    this.broadcast({ type: 'telemetry', frame })
    if (robotKey(robot) !== before) this.broadcast({ type: 'robot', robot })
  }

  private arriveAtWaypoint(robot: Robot, mission: Mission, s: Internal): void {
    const index = mission.currentWaypointIndex
    const waypoint = mission.waypoints[index]
    if (!waypoint) return
    const label = waypoint.label ? ` (${waypoint.label})` : ''
    this.log(
      'info',
      'nav',
      'WAYPOINT_REACHED',
      `${robot.callsign}: reached waypoint ${index + 1}/${mission.waypoints.length}${label}`,
      robot.id,
    )
    const work =
      waypoint.action === 'hold' ? (waypoint.holdSeconds ?? 0) : WORK_SECONDS[waypoint.action]
    if (work > 0) {
      s.working = true
      s.workRemaining = work
      if (waypoint.action === 'lift') {
        robot.payloadKg = waypoint.liftKg ?? 0
        this.log(
          'info',
          'mission',
          'LIFT_STARTED',
          `${robot.callsign}: lifting ${robot.payloadKg} kg`,
          robot.id,
        )
      }
    } else {
      this.nextWaypoint(robot, mission)
    }
  }

  private finishWork(robot: Robot, mission: Mission, s: Internal): void {
    s.working = false
    s.workRemaining = 0
    const waypoint = mission.waypoints[mission.currentWaypointIndex]
    if (waypoint?.action === 'scan' && this.rng() < 0.4) {
      this.createDetection(robot, mission.id, waypoint.position)
    }
    if (waypoint?.action === 'lift') {
      this.log(
        'info',
        'mission',
        'LIFT_COMPLETE',
        `${robot.callsign}: load secured and released`,
        robot.id,
      )
      robot.payloadKg = 0
    }
    this.nextWaypoint(robot, mission)
  }

  private nextWaypoint(robot: Robot, mission: Mission): void {
    mission.currentWaypointIndex += 1
    mission.updatedAt = this.now
    if (mission.currentWaypointIndex >= mission.waypoints.length) {
      mission.currentWaypointIndex = mission.waypoints.length - 1
      mission.status = 'completed'
      mission.completedAt = this.now
      robot.missionId = null
      robot.status = 'idle'
      this.log(
        'info',
        'mission',
        'MISSION_COMPLETED',
        `${robot.callsign}: mission "${mission.name}" completed`,
        robot.id,
      )
    }
    this.broadcast({ type: 'mission', mission })
  }

  private checkBattery(robot: Robot, s: Internal): void {
    if (robot.battery > 30) {
      s.warned.delete('battery-low')
      s.warned.delete('battery-critical')
    }
    if (robot.battery < 20 && !s.warned.has('battery-low')) {
      s.warned.add('battery-low')
      this.log(
        'warning',
        'battery',
        'BATTERY_LOW',
        `${robot.callsign}: battery below 20%`,
        robot.id,
      )
    }
    if (robot.battery < 8 && !s.warned.has('battery-critical') && robot.status !== 'charging') {
      s.warned.add('battery-critical')
      this.log(
        'critical',
        'battery',
        'BATTERY_CRITICAL',
        `${robot.callsign}: battery critical – returning to base`,
        robot.id,
      )
      if (robot.missionId) this.abortMission(robot.missionId, 'battery critical')
      if (robot.status !== 'fault') robot.status = 'returning'
    }
    if (robot.battery <= 0 && robot.status !== 'fault') {
      robot.status = 'fault'
      robot.faultReason = 'Battery depleted'
      this.log(
        'critical',
        'battery',
        'BATTERY_DEPLETED',
        `${robot.callsign}: battery depleted – robot stopped`,
        robot.id,
      )
    }
  }

  private checkTemperatures(robot: Robot, s: Internal): void {
    s.legTemps.forEach((temp, k) => {
      const leg = LEG_IDS[k]!
      const key = `temp-${leg}`
      if (temp < 60) s.warned.delete(key)
      if (temp >= 70 && !s.warned.has(key)) {
        s.warned.add(key)
        this.log(
          'warning',
          'motor',
          'MOTOR_TEMP_HIGH',
          `${robot.callsign}: ${leg} motor at ${Math.round(temp)}°C`,
          robot.id,
        )
      }
      if (temp >= 85 && robot.status !== 'fault') {
        robot.status = 'fault'
        robot.faultReason = `${leg} motor over-temperature`
        robot.speed = 0
        s.legBias = s.legBias.map(() => 0)
        s.working = false
        this.log(
          'critical',
          'motor',
          'MOTOR_OVERTEMP',
          `${robot.callsign}: ${leg} motor over-temperature – motors disabled`,
          robot.id,
        )
      }
    })
  }

  private frame(robot: Robot, s: Internal): TelemetryFrame {
    const spec = MODEL_SPECS[robot.model]
    const gait = GAITS[robot.gait]
    const moving = s.stepHz > 0
    const t = this.now / 1000
    const lowered = robot.status === 'charging' || robot.status === 'fault'
    const current =
      robot.status === 'charging'
        ? -15
        : 2 + 18 * (robot.speed / spec.maxSpeed) + robot.payloadKg * 0.05
    const legs: LegState[] = LEG_IDS.map((id, k) => {
      const p = (s.gaitPhase + (gait.offsets[k] ?? 0)) % 1
      const swingPortion = 1 - gait.duty
      const swing = moving && p < swingPortion
      let coxa = 0
      let femur = lowered ? 10 : 35
      if (moving) {
        // Swing: sweep forward with the foot raised. Stance: push back with the foot down.
        const progress = swing ? p / swingPortion : (p - swingPortion) / gait.duty
        coxa = swing ? -15 + 30 * progress : 15 - 30 * progress
        if (swing) femur += 25 * Math.sin(Math.PI * progress)
      }
      const stanceLegs = moving ? Math.max(1, Math.round(6 * gait.duty)) : 6
      return {
        id,
        coxa: round(coxa, 1),
        femur: round(femur, 1),
        tibia: round(lowered ? -60 : -95 + (femur - 35) * 0.6, 1),
        contact: !swing,
        temperature: round(s.legTemps[k] ?? AMBIENT_C, 1),
        load: swing
          ? 0
          : round((robot.payloadKg + (robot.model === 'HX-6 Heavy' ? 140 : 32)) / stanceLegs, 1),
      }
    })
    const noise = () => between(this.rng, -0.4, 0.4)
    return {
      robotId: robot.id,
      ts: this.now,
      position: { ...robot.position },
      heading: round(robot.heading, 1),
      speed: robot.speed,
      battery: {
        percent: round(robot.battery, 1),
        voltage: round(42 + 0.084 * robot.battery, 2),
        current: round(current + noise(), 2),
        temperature: round(AMBIENT_C + 2 + Math.max(0, current) * 0.35 + noise(), 1),
      },
      imu: {
        roll: round((moving ? Math.sin(s.gaitPhase * Math.PI * 4) * 1.5 : 0) + noise(), 2),
        pitch: round((moving ? Math.sin(t / 7) * 3 : 0) + noise(), 2),
        yaw: round(robot.heading, 1),
      },
      legs,
      gait: robot.gait,
      gaitPhase: round(s.gaitPhase, 3),
      stepHz: s.stepHz,
      signal: Math.round(
        clamp(100 - distanceM(robot.position, robot.home) / 9 + noise() * 5, 3, 100),
      ),
      payloadKg: robot.payloadKg,
    }
  }

  // --- Commands -----------------------------------------------------------------------------------

  /** Queue a command. It is accepted or rejected 0.3–0.9 s later, announced on the live channel. */
  issueCommand(robotId: string, request: CommandRequest): CommandResult {
    const result: CommandResult = {
      commandId: makeId('cmd'),
      robotId,
      type: request.type,
      status: 'pending',
      ts: this.now,
    }
    this.pending.push({ result, request, resolveAt: this.now + 300 + this.rng() * 600 })
    return { ...result }
  }

  private processCommands(now: number): void {
    const due = this.pending.filter((p) => p.resolveAt <= now)
    if (due.length === 0) return
    this.pending = this.pending.filter((p) => p.resolveAt > now)
    for (const { result, request } of due) {
      const robot = this.robots.get(result.robotId)
      const reason = robot ? this.applyCommand(robot, request) : 'Unknown robot'
      const resolved: CommandResult = {
        ...result,
        status: reason ? 'rejected' : 'accepted',
        ts: now,
        ...(reason ? { reason } : {}),
      }
      this.broadcast({ type: 'command', command: resolved })
      if (robot) {
        this.log(
          reason ? 'warning' : 'info',
          'system',
          reason ? 'COMMAND_REJECTED' : 'COMMAND_ACCEPTED',
          `${robot.callsign}: ${request.type}${request.gait ? ` (${request.gait})` : ''} ${reason ? `rejected – ${reason}` : 'accepted'}`,
          robot.id,
        )
        this.broadcast({ type: 'robot', robot })
      }
    }
  }

  /** Returns a rejection reason, or null if the command was applied. */
  private applyCommand(robot: Robot, request: CommandRequest): string | null {
    const s = this.state(robot.id)
    if (robot.status === 'offline') return 'Robot is offline'
    switch (request.type) {
      case 'stop':
        if (robot.status === 'fault') return 'Robot is in a fault state'
        if (robot.status === 'on-mission' || robot.status === 'returning') {
          s.resumeStatus = robot.status
          robot.status = 'holding'
          robot.speed = 0
        }
        return null
      case 'resume':
        if (robot.status !== 'holding') return 'Robot is not holding'
        robot.status = s.resumeStatus ?? 'idle'
        s.resumeStatus = null
        return null
      case 'return-home':
        if (robot.status === 'fault') return 'Robot is in a fault state'
        if (robot.battery <= 1) return 'Battery too low to move'
        if (robot.missionId) this.abortMission(robot.missionId, 'operator recalled robot')
        robot.status = 'returning'
        return null
      case 'dock':
        if (robot.status === 'fault') return 'Robot is in a fault state'
        if (robot.missionId) return 'Robot is assigned to an active mission'
        if (distanceM(robot.position, robot.home) > 5) return 'Not at home base'
        if (robot.battery >= 99) return 'Battery already full'
        robot.status = 'charging'
        return null
      case 'set-gait':
        if (!request.gait) return 'No gait given'
        robot.gait = request.gait
        return null
      case 'clear-fault': {
        if (robot.status !== 'fault') return 'Robot is not in a fault state'
        if (robot.battery <= 0) return 'Battery depleted – recover the robot manually'
        const hottest = Math.max(...s.legTemps)
        if (hottest > 60)
          return `Motor still hot (${Math.round(hottest)}°C) – wait until below 60°C`
        robot.faultReason = null
        robot.status = robot.missionId ? 'holding' : 'idle'
        s.resumeStatus = robot.missionId ? 'on-mission' : null
        return null
      }
      case 'reboot':
        robot.status = 'offline'
        robot.speed = 0
        s.offlineUntil = this.now + 15_000
        s.resumeStatus = null
        this.log('info', 'system', 'REBOOTING', `${robot.callsign}: rebooting`, robot.id)
        return null
    }
  }

  // --- Missions -----------------------------------------------------------------------------------

  /** Returns a reason the mission can't start, or null if it started. */
  startMission(id: string): string | null {
    const mission = this.missions.get(id)
    if (!mission) return 'Mission not found'
    if (mission.status !== 'draft' && mission.status !== 'scheduled')
      return `Mission is ${mission.status}`
    if (mission.waypoints.length === 0) return 'Mission has no waypoints'
    if (!mission.robotId) return 'No robot assigned'
    const robot = this.robots.get(mission.robotId)
    if (!robot) return 'Assigned robot no longer exists'
    if (robot.status !== 'idle' && robot.status !== 'charging') {
      return `${robot.callsign} is not available (${robot.status})`
    }
    if (robot.battery < 25)
      return `${robot.callsign} battery too low (${Math.round(robot.battery)}%, need 25%)`
    const tooHeavy = mission.waypoints.find(
      (w) => w.action === 'lift' && (w.liftKg ?? 0) > robot.maxPayloadKg,
    )
    if (tooHeavy)
      return `${robot.callsign} cannot lift ${tooHeavy.liftKg} kg (max ${robot.maxPayloadKg} kg)`

    mission.status = 'active'
    mission.currentWaypointIndex = 0
    mission.startedAt = this.now
    mission.completedAt = null
    mission.updatedAt = this.now
    robot.status = 'on-mission'
    robot.missionId = mission.id
    const s = this.state(robot.id)
    s.working = false
    s.workRemaining = 0
    this.log(
      'info',
      'mission',
      'MISSION_STARTED',
      `${robot.callsign}: mission "${mission.name}" started`,
      robot.id,
    )
    this.broadcast({ type: 'mission', mission })
    this.broadcast({ type: 'robot', robot })
    return null
  }

  abortMission(id: string, reason = 'aborted by operator'): string | null {
    const mission = this.missions.get(id)
    if (!mission) return 'Mission not found'
    if (mission.status !== 'active') return `Mission is ${mission.status}`
    mission.status = 'aborted'
    mission.completedAt = this.now
    mission.updatedAt = this.now
    const robot = mission.robotId ? this.robots.get(mission.robotId) : undefined
    if (robot && robot.missionId === mission.id) {
      robot.missionId = null
      robot.payloadKg = 0
      if (robot.status === 'on-mission' || robot.status === 'holding') robot.status = 'idle'
      const s = this.state(robot.id)
      s.working = false
      s.resumeStatus = null
      this.broadcast({ type: 'robot', robot })
    }
    this.log(
      'warning',
      'mission',
      'MISSION_ABORTED',
      `Mission "${mission.name}" aborted: ${reason}`,
      mission.robotId,
    )
    this.broadcast({ type: 'mission', mission })
    return null
  }

  private startDueMissions(now: number): void {
    for (const mission of this.missions.values()) {
      if (
        mission.status !== 'scheduled' ||
        mission.scheduledFor === null ||
        mission.scheduledFor > now
      )
        continue
      const reason = this.startMission(mission.id)
      if (reason) {
        mission.status = 'draft'
        mission.scheduledFor = null
        mission.updatedAt = now
        this.log(
          'warning',
          'mission',
          'MISSION_START_FAILED',
          `Scheduled mission "${mission.name}" could not start: ${reason}`,
          mission.robotId,
        )
        this.broadcast({ type: 'mission', mission })
      }
    }
  }

  // --- Detections, log, triggers ------------------------------------------------------------------

  createDetection(robot: Robot, missionId: string | null, near: LatLng): Detection {
    const detection: Detection = {
      id: makeId('dt'),
      ts: this.now,
      robotId: robot.id,
      missionId,
      position: offsetM(near, between(this.rng, 0, 360), between(this.rng, 2, 15)),
      kind: pick(this.rng, ['thermal', 'acoustic', 'co2', 'visual'] as const),
      confidence: round(between(this.rng, 0.3, 0.98)),
      status: 'unconfirmed',
      notes: '',
    }
    this.detections.set(detection.id, detection)
    this.log(
      'warning',
      'sensor',
      'POSSIBLE_SURVIVOR',
      `${robot.callsign}: possible survivor – ${detection.kind} signature (${Math.round(detection.confidence * 100)}%)`,
      robot.id,
    )
    this.broadcast({ type: 'detection', detection })
    return detection
  }

  log(
    level: EventLevel,
    source: EventSource,
    code: string,
    message: string,
    robotId: string | null,
  ): FleetEvent {
    const event: FleetEvent = {
      id: makeId('ev'),
      ts: this.now,
      robotId,
      level,
      source,
      code,
      message,
      acknowledged: level === 'debug' || level === 'info',
      acknowledgedBy: null,
    }
    this.events.push(event)
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS)
    this.broadcast({ type: 'event', event })
    return event
  }

  /** Make something interesting happen – for demos, manual testing and the chaos panel. */
  trigger(kind: TriggerKind, robotId?: string): string | null {
    if (kind === 'disconnect') {
      this.emitControl({ type: 'drop-connections' })
      return null
    }
    const candidates = [...this.robots.values()].filter((r) => r.status !== 'offline')
    const robot = robotId
      ? this.robots.get(robotId)
      : pick(this.rng, candidates.length ? candidates : [...this.robots.values()])
    if (!robot) return 'Robot not found'
    const s = this.state(robot.id)
    switch (kind) {
      case 'fault':
        s.legTemps[Math.floor(this.rng() * 6)] = 90
        return null
      case 'low-battery':
        robot.battery = Math.min(robot.battery, 19.5)
        return null
      case 'detection':
        this.createDetection(robot, robot.missionId, robot.position)
        return null
      case 'offline':
        if (robot.status === 'offline') return 'Robot is already offline'
        robot.status = 'offline'
        robot.speed = 0
        s.offlineUntil = this.now + 20_000
        this.log('error', 'comms', 'LINK_LOST', `${robot.callsign}: link lost`, robot.id)
        this.broadcast({ type: 'robot', robot })
        return null
    }
  }

  private state(robotId: string): Internal {
    const s = this.internal.get(robotId)
    if (!s) throw new Error(`No internal state for ${robotId}`)
    return s
  }
}

/** The fields whose change triggers a `robot` message on the live channel. */
function robotKey(r: Robot): string {
  return [r.status, r.missionId, r.faultReason, r.gait, r.payloadKg, r.callsign, r.notes].join('|')
}
