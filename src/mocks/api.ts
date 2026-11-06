/**
 * The REST API, as plain functions over the World. `handlers.ts` adapts this to MSW; tests can
 * call `api.handle()` directly. Behaviour is documented in docs/API.md.
 */
import type { SimConfig } from './config'
import { saveConfig } from './config'
import { DEMO_PASSWORD, OPERATING_RADIUS_M, BASE, USERS } from './seed'
import type {
  ApiErrorBody,
  CommandType,
  Detection,
  DetectionStatus,
  FleetEvent,
  Gait,
  Mission,
  MissionInput,
  MissionPriority,
  Robot,
  RobotStatus,
  User,
  Waypoint,
  WaypointAction,
} from './types'
import type { TriggerKind, World } from './world'
import { distanceM, makeId } from './util'

export interface ApiRequest {
  method: string
  /** Pathname only, e.g. `/api/robots/rb_atlas`. */
  path: string
  query: URLSearchParams
  body: unknown
  /** Bearer token, if any. */
  token: string | null
}

export interface ApiResponse {
  status: number
  /** Omitted for 204s. */
  body?: unknown
}

interface Context {
  req: ApiRequest
  params: Record<string, string>
  user: User | null
}

type Handler = (ctx: Context) => ApiResponse

interface Route {
  method: string
  pattern: RegExp
  keys: string[]
  handler: Handler
  /** Who may call it when auth is on. `public` skips auth entirely. */
  access: 'public' | 'read' | 'write' | 'commander'
}

const ROBOT_STATUSES: RobotStatus[] = [
  'idle',
  'on-mission',
  'holding',
  'returning',
  'charging',
  'fault',
  'offline',
]
const COMMANDS: CommandType[] = [
  'stop',
  'resume',
  'return-home',
  'dock',
  'set-gait',
  'clear-fault',
  'reboot',
]
const GAITS: Gait[] = ['tripod', 'ripple', 'wave']
const PRIORITIES: MissionPriority[] = ['low', 'normal', 'high', 'critical']
const ACTIONS: WaypointAction[] = ['move', 'scan', 'lift', 'hold']
const DETECTION_STATUSES: DetectionStatus[] = ['unconfirmed', 'confirmed', 'dismissed']
const TRIGGERS: TriggerKind[] = ['fault', 'low-battery', 'detection', 'offline', 'disconnect']

// --- Response helpers ------------------------------------------------------------------------------

const ok = (body: unknown, status = 200): ApiResponse => ({ status, body: structuredClone(body) })
const noContent = (): ApiResponse => ({ status: 204 })
const fail = (
  status: number,
  code: string,
  message: string,
  fieldErrors?: Record<string, string>,
): ApiResponse => {
  const body: ApiErrorBody = { error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } }
  return { status, body }
}
const notFound = (what: string) => fail(404, 'not_found', `${what} not found`)
const invalid = (fieldErrors: Record<string, string>) =>
  fail(422, 'validation_failed', 'Some fields are invalid', fieldErrors)

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const list = (q: URLSearchParams, key: string) =>
  q
    .get(key)
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? []
const intParam = (q: URLSearchParams, key: string, fallback: number, min: number, max: number) => {
  const n = Number.parseInt(q.get(key) ?? '', 10)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

// --- The API ---------------------------------------------------------------------------------------

export type Api = ReturnType<typeof createApi>

export function createApi(world: World) {
  const routes: Route[] = []
  const route = (method: string, path: string, access: Route['access'], handler: Handler) => {
    const keys: string[] = []
    const pattern = new RegExp(
      '^' + path.replace(/:(\w+)/g, (_, key: string) => (keys.push(key), '([^/]+)')) + '/?$',
    )
    routes.push({ method, pattern, keys, handler, access })
  }

  const robotOr404 = (id: string | undefined) => (id ? world.robots.get(id) : undefined)
  const missionOr404 = (id: string | undefined) => (id ? world.missions.get(id) : undefined)

  // --- Auth ---
  route('POST', '/api/auth/login', 'public', ({ req }) => {
    const body = isObject(req.body) ? req.body : {}
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const errors: Record<string, string> = {}
    if (!email) errors.email = 'Email is required'
    if (!password) errors.password = 'Password is required'
    if (Object.keys(errors).length) return invalid(errors)
    const user = USERS.find((u) => u.email === email)
    if (!user || password !== DEMO_PASSWORD)
      return fail(401, 'invalid_credentials', 'Email or password is incorrect')
    const token = `hmc_${makeId('tok')}_${Math.random().toString(36).slice(2)}`
    world.sessions.set(token, user.id)
    return ok({ token, user })
  })

  route('POST', '/api/auth/logout', 'public', ({ req }) => {
    if (req.token) world.sessions.delete(req.token)
    return noContent()
  })

  route('GET', '/api/auth/me', 'public', ({ req }) => {
    const user = userFor(req.token)
    return user ? ok(user) : fail(401, 'unauthorized', 'Not signed in')
  })

  // --- Fleet summary ---
  route('GET', '/api/stats', 'read', () => {
    const byStatus = Object.fromEntries(ROBOT_STATUSES.map((s) => [s, 0])) as Record<
      RobotStatus,
      number
    >
    for (const r of world.robots.values()) byStatus[r.status] += 1
    const missions = [...world.missions.values()]
    return ok({
      robots: { total: world.robots.size, byStatus },
      missions: {
        active: missions.filter((m) => m.status === 'active').length,
        scheduled: missions.filter((m) => m.status === 'scheduled').length,
      },
      unacknowledgedAlerts: world.events.filter((e) => !e.acknowledged).length,
      openDetections: [...world.detections.values()].filter((d) => d.status === 'unconfirmed')
        .length,
      serverTime: world.now,
    })
  })

  // --- Robots ---
  route('GET', '/api/robots', 'read', ({ req }) => {
    const statuses = list(req.query, 'status')
    const robots = [...world.robots.values()].filter(
      (r) => statuses.length === 0 || statuses.includes(r.status),
    )
    return ok(robots)
  })

  route('GET', '/api/robots/:id', 'read', ({ params }) => {
    const robot = robotOr404(params.id)
    return robot ? ok(robot) : notFound('Robot')
  })

  route('PATCH', '/api/robots/:id', 'write', ({ params, req }) => {
    const robot = robotOr404(params.id)
    if (!robot) return notFound('Robot')
    if (!isObject(req.body)) return fail(400, 'bad_request', 'Expected a JSON object')
    const errors: Record<string, string> = {}
    const { callsign, notes } = req.body
    if (callsign !== undefined) {
      if (
        typeof callsign !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9 -]{1,23}$/.test(callsign.trim())
      ) {
        errors.callsign = 'Callsign must be 2–24 letters, numbers, spaces or dashes'
      } else if (
        [...world.robots.values()].some(
          (r) => r.id !== robot.id && r.callsign.toLowerCase() === callsign.trim().toLowerCase(),
        )
      ) {
        errors.callsign = 'Another robot already uses that callsign'
      }
    }
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > 500)) {
      errors.notes = 'Notes must be at most 500 characters'
    }
    if (Object.keys(errors).length) return invalid(errors)
    if (typeof callsign === 'string') robot.callsign = callsign.trim()
    if (typeof notes === 'string') robot.notes = notes
    return ok(robot)
  })

  route('GET', '/api/robots/:id/telemetry', 'read', ({ params, req }) => {
    if (!robotOr404(params.id)) return notFound('Robot')
    const minutes = intParam(req.query, 'minutes', 5, 1, 10)
    const step = intParam(req.query, 'step', 1, 1, 20)
    const since = world.now - minutes * 60_000
    const frames = (world.telemetry.get(params.id ?? '') ?? []).filter(
      (f, i) => f.ts >= since && i % step === 0,
    )
    return ok(frames)
  })

  route('POST', '/api/robots/:id/commands', 'write', ({ params, req }) => {
    const robot = robotOr404(params.id)
    if (!robot) return notFound('Robot')
    const body = isObject(req.body) ? req.body : {}
    const type = body.type as CommandType
    if (!COMMANDS.includes(type))
      return invalid({ type: `Command must be one of: ${COMMANDS.join(', ')}` })
    const gait = body.gait as Gait | undefined
    if (type === 'set-gait' && (!gait || !GAITS.includes(gait))) {
      return invalid({ gait: `Gait must be one of: ${GAITS.join(', ')}` })
    }
    return ok(world.issueCommand(robot.id, gait ? { type, gait } : { type }), 202)
  })

  // --- Missions ---
  route('GET', '/api/missions', 'read', ({ req }) => {
    const statuses = list(req.query, 'status')
    const robotId = req.query.get('robotId')
    const missions = [...world.missions.values()]
      .filter((m) => statuses.length === 0 || statuses.includes(m.status))
      .filter((m) => !robotId || m.robotId === robotId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    return ok(missions)
  })

  route('GET', '/api/missions/:id', 'read', ({ params }) => {
    const mission = missionOr404(params.id)
    return mission ? ok(mission) : notFound('Mission')
  })

  route('POST', '/api/missions', 'write', ({ req, user }) => {
    const result = validateMission(req.body, world)
    if ('errors' in result) return invalid(result.errors)
    const now = world.now
    const mission: Mission = {
      id: makeId('ms'),
      ...result.value,
      status: result.value.robotId && result.value.scheduledFor ? 'scheduled' : 'draft',
      currentWaypointIndex: -1,
      createdBy: user?.id ?? 'anonymous',
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
    }
    world.missions.set(mission.id, mission)
    return ok(mission, 201)
  })

  route('PATCH', '/api/missions/:id', 'write', ({ params, req }) => {
    const mission = missionOr404(params.id)
    if (!mission) return notFound('Mission')
    if (mission.status !== 'draft' && mission.status !== 'scheduled') {
      return fail(409, 'conflict', `A ${mission.status} mission can't be edited`)
    }
    if (!isObject(req.body)) return fail(400, 'bad_request', 'Expected a JSON object')
    const merged = { ...toInput(mission), ...req.body }
    const result = validateMission(merged, world)
    if ('errors' in result) return invalid(result.errors)
    Object.assign(mission, result.value, {
      status: result.value.robotId && result.value.scheduledFor ? 'scheduled' : 'draft',
      updatedAt: world.now,
    })
    return ok(mission)
  })

  route('DELETE', '/api/missions/:id', 'commander', ({ params }) => {
    const mission = missionOr404(params.id)
    if (!mission) return notFound('Mission')
    if (mission.status === 'active')
      return fail(409, 'conflict', 'Abort the mission before deleting it')
    world.missions.delete(mission.id)
    return noContent()
  })

  route('POST', '/api/missions/:id/start', 'write', ({ params }) => {
    const mission = missionOr404(params.id)
    if (!mission) return notFound('Mission')
    const reason = world.startMission(mission.id)
    return reason ? fail(409, 'conflict', reason) : ok(mission)
  })

  route('POST', '/api/missions/:id/abort', 'write', ({ params }) => {
    const mission = missionOr404(params.id)
    if (!mission) return notFound('Mission')
    const reason = world.abortMission(mission.id)
    return reason ? fail(409, 'conflict', reason) : ok(mission)
  })

  // --- Events ---
  route('GET', '/api/events', 'read', ({ req }) => {
    const q = req.query
    const robotIds = list(q, 'robotId')
    const levels = list(q, 'level')
    const sources = list(q, 'source')
    const acknowledged = q.get('acknowledged')
    const text = q.get('q')?.trim().toLowerCase() ?? ''
    const since = Number(q.get('since') ?? Number.NaN)
    const until = Number(q.get('until') ?? Number.NaN)
    const limit = intParam(q, 'limit', 50, 1, 200)
    const cursor = q.get('cursor')

    const matches = (e: FleetEvent) =>
      (robotIds.length === 0 || (e.robotId !== null && robotIds.includes(e.robotId))) &&
      (levels.length === 0 || levels.includes(e.level)) &&
      (sources.length === 0 || sources.includes(e.source)) &&
      (acknowledged === null || String(e.acknowledged) === acknowledged) &&
      (!text || e.message.toLowerCase().includes(text) || e.code.toLowerCase().includes(text)) &&
      (Number.isNaN(since) || e.ts >= since) &&
      (Number.isNaN(until) || e.ts <= until)

    // Newest first. The cursor is the id of the last item on the previous page, so pages stay
    // stable while new events arrive.
    let start = world.events.length - 1
    if (cursor) {
      const index = world.events.findIndex((e) => e.id === cursor)
      if (index === -1)
        return fail(400, 'bad_cursor', 'Cursor is no longer valid; start again without one')
      start = index - 1
    }
    const items: FleetEvent[] = []
    let total = 0
    let nextCursor: string | null = null
    for (let i = world.events.length - 1; i >= 0; i--) {
      const e = world.events[i]!
      if (!matches(e)) continue
      total += 1
      if (i > start) continue
      if (items.length < limit) items.push(e)
      else if (nextCursor === null) nextCursor = items[items.length - 1]!.id
    }
    return ok({ items, nextCursor, total })
  })

  route('PATCH', '/api/events/:id', 'write', ({ params, req, user }) => {
    const event = world.events.find((e) => e.id === params.id)
    if (!event) return notFound('Event')
    const body = isObject(req.body) ? req.body : {}
    if (typeof body.acknowledged !== 'boolean')
      return invalid({ acknowledged: 'Must be true or false' })
    event.acknowledged = body.acknowledged
    event.acknowledgedBy = body.acknowledged ? (user?.id ?? null) : null
    return ok(event)
  })

  route('POST', '/api/events/acknowledge', 'write', ({ req, user }) => {
    const body = isObject(req.body) ? req.body : {}
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === 'string')
      : null
    if (!ids || ids.length === 0) return invalid({ ids: 'Provide a non-empty array of event ids' })
    if (ids.length > 500) return invalid({ ids: 'At most 500 ids per request' })
    const wanted = new Set(ids)
    let updated = 0
    for (const e of world.events) {
      if (wanted.has(e.id) && !e.acknowledged) {
        e.acknowledged = true
        e.acknowledgedBy = user?.id ?? null
        updated += 1
      }
    }
    return ok({ updated })
  })

  // --- Detections ---
  route('GET', '/api/detections', 'read', ({ req }) => {
    const statuses = list(req.query, 'status')
    const missionId = req.query.get('missionId')
    const robotId = req.query.get('robotId')
    const items = [...world.detections.values()]
      .filter((d) => statuses.length === 0 || statuses.includes(d.status))
      .filter((d) => !missionId || d.missionId === missionId)
      .filter((d) => !robotId || d.robotId === robotId)
      .sort((a, b) => b.ts - a.ts)
    return ok(items)
  })

  route('PATCH', '/api/detections/:id', 'write', ({ params, req }) => {
    const detection = params.id ? world.detections.get(params.id) : undefined
    if (!detection) return notFound('Detection')
    const body = isObject(req.body) ? req.body : {}
    const errors: Record<string, string> = {}
    if (body.status !== undefined && !DETECTION_STATUSES.includes(body.status as DetectionStatus)) {
      errors.status = `Status must be one of: ${DETECTION_STATUSES.join(', ')}`
    }
    if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 1000)) {
      errors.notes = 'Notes must be at most 1000 characters'
    }
    if (Object.keys(errors).length) return invalid(errors)
    if (body.status !== undefined) detection.status = body.status as Detection['status']
    if (typeof body.notes === 'string') detection.notes = body.notes
    return ok(detection)
  })

  // --- Simulator controls (never need auth, never delayed or failed) ---
  route('GET', '/api/sim/config', 'public', () => ok(world.config))

  route('PATCH', '/api/sim/config', 'public', ({ req }) => {
    if (!isObject(req.body)) return fail(400, 'bad_request', 'Expected a JSON object')
    const patch = sanitizeConfig(req.body)
    if ('errors' in patch) return invalid(patch.errors)
    const config = world.updateConfig(patch.value)
    saveConfig(config)
    return ok(config)
  })

  route('POST', '/api/sim/reset', 'public', () => {
    world.reset(Date.now())
    return noContent()
  })

  route('POST', '/api/sim/expire-sessions', 'public', () => {
    world.sessions.clear()
    return noContent()
  })

  route('POST', '/api/sim/trigger', 'public', ({ req }) => {
    const body = isObject(req.body) ? req.body : {}
    const kind = body.kind as TriggerKind
    if (!TRIGGERS.includes(kind))
      return invalid({ kind: `Kind must be one of: ${TRIGGERS.join(', ')}` })
    const reason = world.trigger(kind, typeof body.robotId === 'string' ? body.robotId : undefined)
    return reason ? fail(409, 'conflict', reason) : noContent()
  })

  // --- Dispatch ---
  function userFor(token: string | null): User | null {
    if (!token) return null
    const id = world.sessions.get(token)
    return USERS.find((u) => u.id === id) ?? null
  }

  function handle(req: ApiRequest): ApiResponse {
    const method = req.method.toUpperCase()
    let pathMatched = false
    for (const r of routes) {
      const match = r.pattern.exec(req.path)
      if (!match) continue
      pathMatched = true
      if (r.method !== method) continue
      const params = Object.fromEntries(
        r.keys.map((k, i) => [k, decodeURIComponent(match[i + 1] ?? '')]),
      )
      const user = userFor(req.token)
      if (r.access !== 'public' && world.config.requireAuth) {
        if (!user) return fail(401, 'unauthorized', 'Sign in to continue')
        if (r.access === 'write' && user.role === 'observer') {
          return fail(403, 'forbidden', 'Observers have read-only access')
        }
        if (r.access === 'commander' && user.role !== 'commander') {
          return fail(403, 'forbidden', 'Only commanders can do that')
        }
      }
      return r.handler({ req, params, user })
    }
    return pathMatched
      ? fail(405, 'method_not_allowed', `${method} not allowed here`)
      : notFound('Endpoint')
  }

  return { handle, userFor }
}

// --- Validation ------------------------------------------------------------------------------------

function toInput(m: Mission): MissionInput {
  return {
    name: m.name,
    robotId: m.robotId,
    priority: m.priority,
    scheduledFor: m.scheduledFor,
    waypoints: m.waypoints,
    notes: m.notes,
  }
}

type Validated<T> = { value: T } | { errors: Record<string, string> }

function validateMission(
  raw: unknown,
  world: World,
): Validated<Omit<MissionInput, 'waypoints'> & { waypoints: Waypoint[] }> {
  if (!isObject(raw)) return { errors: { '': 'Expected a JSON object' } }
  const errors: Record<string, string> = {}
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (name.length < 3 || name.length > 80) errors.name = 'Name must be 3–80 characters'

  const priority = (raw.priority ?? 'normal') as MissionPriority
  if (!PRIORITIES.includes(priority))
    errors.priority = `Priority must be one of: ${PRIORITIES.join(', ')}`

  const robotId = raw.robotId ?? null
  let robot: Robot | undefined
  if (robotId !== null) {
    robot = typeof robotId === 'string' ? world.robots.get(robotId) : undefined
    if (!robot) errors.robotId = 'Unknown robot'
  }

  const scheduledFor = raw.scheduledFor ?? null
  if (scheduledFor !== null) {
    if (typeof scheduledFor !== 'number' || !Number.isFinite(scheduledFor))
      errors.scheduledFor = 'Must be a timestamp'
    else if (scheduledFor < world.now - 60_000) errors.scheduledFor = 'Must be in the future'
  }

  const notes = raw.notes ?? ''
  if (typeof notes !== 'string' || notes.length > 1000)
    errors.notes = 'Notes must be at most 1000 characters'

  const waypoints: Waypoint[] = []
  if (!Array.isArray(raw.waypoints)) {
    errors.waypoints = 'Waypoints must be a list'
  } else if (raw.waypoints.length > 25) {
    errors.waypoints = 'At most 25 waypoints'
  } else {
    raw.waypoints.forEach((w: unknown, i) => {
      const at = (field: string) => `waypoints.${i}.${field}`
      if (!isObject(w)) {
        errors[`waypoints.${i}`] = 'Invalid waypoint'
        return
      }
      const position = isObject(w.position) ? w.position : null
      const lat = Number(position?.lat)
      const lng = Number(position?.lng)
      if (!position || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        errors[at('position')] = 'Position is required'
      } else if (distanceM(BASE, { lat, lng }) > OPERATING_RADIUS_M) {
        errors[at('position')] =
          `Outside the operating area (${OPERATING_RADIUS_M / 1000} km from base)`
      }
      const action = w.action as WaypointAction
      if (!ACTIONS.includes(action))
        errors[at('action')] = `Action must be one of: ${ACTIONS.join(', ')}`
      if (w.label !== undefined && (typeof w.label !== 'string' || w.label.length > 40)) {
        errors[at('label')] = 'Label must be at most 40 characters'
      }
      const holdSeconds = w.holdSeconds
      if (
        action === 'hold' &&
        (typeof holdSeconds !== 'number' ||
          !Number.isInteger(holdSeconds) ||
          holdSeconds < 1 ||
          holdSeconds > 600)
      ) {
        errors[at('holdSeconds')] = 'Hold time must be a whole number of seconds, 1–600'
      }
      const liftKg = w.liftKg
      const maxLift = robot?.maxPayloadKg ?? 250
      if (action === 'lift') {
        if (typeof liftKg !== 'number' || !(liftKg > 0))
          errors[at('liftKg')] = 'Lift weight is required'
        else if (liftKg > maxLift) {
          errors[at('liftKg')] = robot
            ? `${robot.callsign} can lift at most ${maxLift} kg`
            : `No robot can lift more than ${maxLift} kg`
        }
      }
      waypoints.push({
        id: typeof w.id === 'string' && w.id ? w.id : makeId('wp'),
        position: { lat, lng },
        action,
        ...(typeof w.label === 'string' && w.label ? { label: w.label } : {}),
        ...(action === 'hold' ? { holdSeconds: holdSeconds as number } : {}),
        ...(action === 'lift' ? { liftKg: liftKg as number } : {}),
      })
    })
  }

  if (Object.keys(errors).length) return { errors }
  return {
    value: {
      name,
      robotId: robotId as string | null,
      priority,
      scheduledFor: scheduledFor as number | null,
      waypoints,
      notes: notes as string,
    },
  }
}

function sanitizeConfig(raw: Record<string, unknown>): Validated<Partial<SimConfig>> {
  const errors: Record<string, string> = {}
  const value: Partial<SimConfig> = {}
  const num = (key: keyof SimConfig, min: number, max: number) => {
    if (raw[key] === undefined) return
    const n = raw[key]
    if (typeof n !== 'number' || n < min || n > max)
      errors[key] = `Must be a number from ${min} to ${max}`
    else (value as Record<string, unknown>)[key] = n
  }
  num('errorRate', 0, 1)
  num('tickMs', 100, 5_000)
  num('timeScale', 0, 50)
  num('faultRatePerMinute', 0, 10)
  num('warmupMinutes', 0, 10)
  num('seed', 0, 2 ** 31)
  if (raw.latency !== undefined) {
    const l = raw.latency
    if (
      !Array.isArray(l) ||
      l.length !== 2 ||
      !l.every((n) => typeof n === 'number' && n >= 0 && n <= 30_000) ||
      l[0] > l[1]
    ) {
      errors.latency = 'Must be [min, max] in ms, 0–30000'
    } else value.latency = [l[0], l[1]]
  }
  if (raw.requireAuth !== undefined) {
    if (typeof raw.requireAuth !== 'boolean') errors.requireAuth = 'Must be true or false'
    else value.requireAuth = raw.requireAuth
  }
  return Object.keys(errors).length ? { errors } : { value }
}
