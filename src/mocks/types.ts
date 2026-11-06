/**
 * API contract for the Hexapod Mission Control simulator.
 *
 * These are the shapes the simulated backend sends and accepts. In chapter 5 you'll write Zod
 * schemas that mirror them for your app; do NOT import from `src/mocks` in application code.
 * Treat this folder as "the backend team's repo".
 *
 * Conventions:
 * - Timestamps are epoch milliseconds (numbers).
 * - Angles are degrees. Distances are metres. Speeds are metres/second.
 * - IDs are opaque strings.
 */

export interface LatLng {
  lat: number
  lng: number
}

// ---------------------------------------------------------------------------------------------
// Users & auth
// ---------------------------------------------------------------------------------------------

export type Role = 'commander' | 'operator' | 'observer'

export interface User {
  id: string
  name: string
  email: string
  role: Role
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  user: User
}

// ---------------------------------------------------------------------------------------------
// Robots
// ---------------------------------------------------------------------------------------------

export type RobotModel = 'HX-6 Scout' | 'HX-6 Heavy'

export type RobotStatus =
  | 'idle'
  | 'on-mission'
  | 'holding'
  | 'returning'
  | 'charging'
  | 'fault'
  | 'offline'

export type Gait = 'tripod' | 'ripple' | 'wave'

export interface Robot {
  id: string
  callsign: string
  serial: string
  model: RobotModel
  status: RobotStatus
  /** 0–100 */
  battery: number
  position: LatLng
  /** 0–360, 0 = north */
  heading: number
  speed: number
  gait: Gait
  firmware: string
  home: LatLng
  maxPayloadKg: number
  payloadKg: number
  missionId: string | null
  /** Human-readable reason when status is `fault`. */
  faultReason: string | null
  notes: string
  lastSeen: number
}

export interface RobotPatch {
  callsign?: string
  notes?: string
}

export type LegId = 'LF' | 'LM' | 'LR' | 'RF' | 'RM' | 'RR'

export interface LegState {
  id: LegId
  /** Hip yaw, degrees. */
  coxa: number
  /** Upper leg pitch, degrees. */
  femur: number
  /** Lower leg pitch, degrees. */
  tibia: number
  /** Foot on the ground? */
  contact: boolean
  /** Motor temperature, °C. */
  temperature: number
  /** Load carried by this leg, kg. */
  load: number
}

export interface TelemetryFrame {
  robotId: string
  ts: number
  position: LatLng
  heading: number
  speed: number
  battery: {
    percent: number
    voltage: number
    /** Amps; positive = discharging, negative = charging. */
    current: number
    temperature: number
  }
  imu: { roll: number; pitch: number; yaw: number }
  legs: LegState[]
  gait: Gait
  /**
   * Position in the gait cycle, 0–1, and how many cycles per real second the legs are doing.
   * Frames arrive only a few times a second, so for smooth animation (chapter 12) extrapolate
   * `gaitPhase + stepHz * secondsSinceFrame` rather than jumping between frames.
   */
  gaitPhase: number
  stepHz: number
  /** 0–100 link quality to base. */
  signal: number
  payloadKg: number
}

export type CommandType =
  | 'stop'
  | 'resume'
  | 'return-home'
  | 'dock'
  | 'set-gait'
  | 'clear-fault'
  | 'reboot'

export interface CommandRequest {
  type: CommandType
  /** Required when type is `set-gait`. */
  gait?: Gait
}

export interface CommandResult {
  commandId: string
  robotId: string
  type: CommandType
  status: 'pending' | 'accepted' | 'rejected'
  reason?: string
  ts: number
}

// ---------------------------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------------------------

export type MissionStatus = 'draft' | 'scheduled' | 'active' | 'completed' | 'aborted'

export type MissionPriority = 'low' | 'normal' | 'high' | 'critical'

export type WaypointAction = 'move' | 'scan' | 'lift' | 'hold'

export interface Waypoint {
  id: string
  position: LatLng
  action: WaypointAction
  label?: string
  /** For `hold`: seconds to wait (1–600). */
  holdSeconds?: number
  /** For `lift`: kilograms to lift (must not exceed the robot's maxPayloadKg). */
  liftKg?: number
}

export interface Mission {
  id: string
  name: string
  robotId: string | null
  status: MissionStatus
  priority: MissionPriority
  scheduledFor: number | null
  waypoints: Waypoint[]
  /** Index of the waypoint the robot is heading to / working at. -1 before start. */
  currentWaypointIndex: number
  notes: string
  createdBy: string
  createdAt: number
  updatedAt: number
  startedAt: number | null
  completedAt: number | null
}

export interface MissionInput {
  name: string
  robotId: string | null
  priority: MissionPriority
  scheduledFor: number | null
  waypoints: Array<Omit<Waypoint, 'id'> & { id?: string }>
  notes: string
}

// ---------------------------------------------------------------------------------------------
// Events (the log) & detections
// ---------------------------------------------------------------------------------------------

export type EventLevel = 'debug' | 'info' | 'warning' | 'error' | 'critical'

export type EventSource = 'system' | 'motor' | 'battery' | 'nav' | 'comms' | 'mission' | 'sensor'

export interface FleetEvent {
  id: string
  ts: number
  robotId: string | null
  level: EventLevel
  source: EventSource
  /** Machine-readable, e.g. `MOTOR_OVERTEMP`. */
  code: string
  message: string
  acknowledged: boolean
  acknowledgedBy: string | null
}

export interface Page<T> {
  items: T[]
  /** Pass back as `?cursor=` to get the next page; null when there are no more. */
  nextCursor: string | null
  total: number
}

export type DetectionKind = 'thermal' | 'acoustic' | 'co2' | 'visual'

export type DetectionStatus = 'unconfirmed' | 'confirmed' | 'dismissed'

export interface Detection {
  id: string
  ts: number
  robotId: string
  missionId: string | null
  position: LatLng
  kind: DetectionKind
  /** 0–1 */
  confidence: number
  status: DetectionStatus
  notes: string
}

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    /** For 422s: field path (e.g. `waypoints.2.liftKg`) → message. */
    fieldErrors?: Record<string, string>
  }
}

// ---------------------------------------------------------------------------------------------
// Live channel (WebSocket) messages
// ---------------------------------------------------------------------------------------------

export type ServerMessage =
  | { type: 'hello'; serverTime: number; robots: Robot[] }
  | { type: 'telemetry'; frame: TelemetryFrame }
  | { type: 'robot'; robot: Robot }
  | { type: 'event'; event: FleetEvent }
  | { type: 'mission'; mission: Mission }
  | { type: 'detection'; detection: Detection }
  | { type: 'command'; command: CommandResult }
  | { type: 'pong'; id: number; serverTime: number }
  | { type: 'error'; code: string; message: string }

export type ClientMessage =
  | { type: 'auth'; token: string }
  /** Limit telemetry frames to these robots. `'*'` (the default) means all robots. */
  | { type: 'subscribe'; robotIds: string[] | '*' }
  | { type: 'ping'; id: number }
