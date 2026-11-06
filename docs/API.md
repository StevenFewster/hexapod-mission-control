# Simulator API

Hexapod Mission Control talks to a simulated backend that runs **inside the browser** using
[Mock Service Worker](https://mswjs.io). There is no server to deploy, and the public demo works
the same as your dev machine. The code lives in `src/mocks/`; treat it as another team's service.
Your app should only know the HTTP and WebSocket contract described here.

TypeScript shapes for everything below are in [`src/mocks/types.ts`](../src/mocks/types.ts).
Don't import them into app code. Writing your own Zod schemas is part of chapter 5.

## Conventions

- Base path: `/api`. JSON in, JSON out.
- Timestamps are epoch **milliseconds**. Angles in degrees, distances in metres, speeds in m/s.
- Errors always look like this:
  ```json
  { "error": { "code": "validation_failed", "message": "Some fields are invalid",
               "fieldErrors": { "waypoints.2.liftKg": "Cygnus can lift at most 40 kg" } } }
  ```
  | Status | `code` | When |
  |---|---|---|
  | 400 | `bad_request`, `bad_cursor` | Malformed JSON or a stale cursor |
  | 401 | `unauthorized`, `invalid_credentials` | No or expired token (auth on) / wrong password |
  | 403 | `forbidden` | Your role can't do that |
  | 404 | `not_found` | Unknown resource or endpoint |
  | 409 | `conflict` | Valid request, wrong state (e.g. starting a mission whose robot is busy) |
  | 422 | `validation_failed` | Field errors in `fieldErrors`, keyed by path |
  | 500 | `internal` | Simulated failure (see `errorRate`) |
- Every non-`/sim` request is delayed by a random **latency** (default 150–600 ms), and can fail
  at random with a 500 when **errorRate** is above 0. Your UI must cope with both.

## Auth

Auth is **off** until chapter 6. Then set `requireAuth: true` (see [Simulator controls](#simulator-controls)).

Demo users (password `mission-control` for all):

| Email | Role | Can |
|---|---|---|
| `commander@hexapod.dev` | commander | everything |
| `operator@hexapod.dev` | operator | everything except deleting missions |
| `observer@hexapod.dev` | observer | read only (any write → 403) |

| Method & path | Body | Response |
|---|---|---|
| `POST /api/auth/login` | `{ email, password }` | `200 { token, user }` · `401` · `422` |
| `POST /api/auth/logout` | – | `204` |
| `GET /api/auth/me` | – | `200 User` · `401` |

Send `Authorization: Bearer <token>` on every request. Tokens don't expire on their own, but
`POST /api/sim/expire-sessions` kills them all so you can test your 401 handling.

## Fleet

| Method & path | Notes |
|---|---|
| `GET /api/stats` | `{ robots: { total, byStatus }, missions: { active, scheduled }, unacknowledgedAlerts, openDetections, serverTime }` |
| `GET /api/robots?status=idle,charging` | `Robot[]`. `status` is optional, comma-separated. |
| `GET /api/robots/:id` | `Robot` |
| `PATCH /api/robots/:id` | `{ callsign?, notes? }` → `Robot`. Callsign 2–24 chars, unique (422 otherwise). Notes ≤ 500. |
| `GET /api/robots/:id/telemetry?minutes=5&step=1` | `TelemetryFrame[]`, oldest first. Up to 10 minutes of history; `step=n` keeps every nth frame. Offline robots have gaps. |
| `POST /api/robots/:id/commands` | `{ type, gait? }` → **`202 CommandResult`** with `status: "pending"`. |

### Robot statuses

`idle` · `on-mission` · `holding` (paused) · `returning` (to base) · `charging` · `fault` · `offline`

### Commands are asynchronous

`POST …/commands` only *queues* a command. 0.3–0.9 s later the robot accepts or rejects it, and
the result arrives on the [live channel](#live-channel-websocket) as
`{ type: "command", command: { commandId, status: "accepted" | "rejected", reason? } }`. Match it
on `commandId`. That's your hook for optimistic UI and rollback.

| Command | Accepted when | Effect |
|---|---|---|
| `stop` | not offline / fault | `on-mission` or `returning` → `holding` |
| `resume` | `holding` | back to what it was doing |
| `return-home` | not fault, battery > 1% | aborts its mission, walks home, then charges |
| `dock` | within 5 m of home, no mission, battery < 99% | `charging` |
| `set-gait` (+ `gait`) | not offline | `tripod` fastest · `ripple` · `wave` most stable |
| `clear-fault` | `fault`, all motors < 60 °C | `idle`, or `holding` if it has a mission |
| `reboot` | not offline | offline for 15 s, then back |

Rejections carry a human-readable `reason`, e.g. `Motor still hot (78°C) – wait until below 60°C`.

## Missions

| Method & path | Notes |
|---|---|
| `GET /api/missions?status=active,scheduled&robotId=` | `Mission[]`, most recently updated first |
| `GET /api/missions/:id` | `Mission` |
| `POST /api/missions` | `MissionInput` → `201 Mission` · `422` |
| `PATCH /api/missions/:id` | Partial `MissionInput` → `Mission`. Only `draft`/`scheduled` (else `409`). |
| `DELETE /api/missions/:id` | `204`. Commander only. Not while `active` (`409`). |
| `POST /api/missions/:id/start` | → `Mission` (now `active`) · `409` with the reason it can't start |
| `POST /api/missions/:id/abort` | → `Mission` (now `aborted`) · `409` if not active |

**Status:** a mission with both `robotId` and `scheduledFor` is `scheduled`, otherwise `draft`.
Scheduled missions start automatically when their time comes (or fall back to `draft` with a
warning event if the robot isn't available). Then `active` → `completed` | `aborted`.

**Validation (422 `fieldErrors` keys):**

| Field | Rule |
|---|---|
| `name` | 3–80 characters after trimming |
| `priority` | `low` · `normal` · `high` · `critical` |
| `robotId` | `null` or an existing robot |
| `scheduledFor` | `null` or a future timestamp |
| `notes` | ≤ 1000 characters |
| `waypoints` | 0–25 (but starting needs at least 1) |
| `waypoints.N.position` | within **5 km of base** (51.9925, −1.7135) |
| `waypoints.N.action` | `move` · `scan` (40 s) · `lift` (30 s) · `hold` |
| `waypoints.N.holdSeconds` | required for `hold`: integer 1–600 |
| `waypoints.N.liftKg` | required for `lift`: > 0 and ≤ the assigned robot's `maxPayloadKg` (Scout 40, Heavy 250) |
| `waypoints.N.label` | optional, ≤ 40 characters |

**Starting can fail (409)** if the robot is busy, below 25% battery, can't lift a waypoint's
load, or the mission has no waypoints/robot.

## Events (the log)

| Method & path | Notes |
|---|---|
| `GET /api/events` | `Page<FleetEvent>`: `{ items, nextCursor, total }`, newest first |
| `PATCH /api/events/:id` | `{ acknowledged: boolean }` → `FleetEvent` |
| `POST /api/events/acknowledge` | `{ ids: string[] }` (≤ 500) → `{ updated }` |

Query parameters for `GET /api/events` (all optional):

| Param | Example | Meaning |
|---|---|---|
| `limit` | `50` | 1–200, default 50 |
| `cursor` | `ev_h04950` | `nextCursor` from the previous page |
| `robotId` | `rb_atlas,rb_echo` | comma-separated |
| `level` | `warning,error,critical` | `debug` · `info` · `warning` · `error` · `critical` |
| `source` | `motor,battery` | `system` · `motor` · `battery` · `nav` · `comms` · `mission` · `sensor` |
| `acknowledged` | `false` | `true` / `false` |
| `q` | `overtemp` | case-insensitive search in message and code |
| `since`, `until` | `1762425600000` | timestamp range |

There are ~5,000 historical events over the last 14 days, plus everything that happens live.
Cursors are keyset-based, so new events don't shift pages you've already loaded. Debug and info
events arrive already acknowledged; warnings and above need a human to acknowledge them.

## Detections (possible survivors)

| Method & path | Notes |
|---|---|
| `GET /api/detections?status=unconfirmed&missionId=&robotId=` | `Detection[]`, newest first |
| `PATCH /api/detections/:id` | `{ status?, notes? }` → `Detection`. Status: `unconfirmed` · `confirmed` · `dismissed`. |

Robots sometimes make a detection when they finish a `scan` waypoint. Each one also creates a
`POSSIBLE_SURVIVOR` warning event.

## Live channel (WebSocket)

```
wss://live.hexapod.local/v1
```

(It isn't a real host. MSW intercepts `new WebSocket(...)` to that URL in the page.)

Every message is a JSON string.

**Server → client** (`ServerMessage` in types.ts):

| `type` | Payload | When |
|---|---|---|
| `hello` | `serverTime`, `robots: Robot[]` | On connect (or after `auth` when auth is on) |
| `telemetry` | `frame: TelemetryFrame` | Every tick (default 500 ms) for every online robot |
| `robot` | `robot: Robot` | When status, mission, fault, gait, payload, callsign or notes change |
| `mission` | `mission: Mission` | Mission started, advanced to next waypoint, completed, aborted |
| `event` | `event: FleetEvent` | Every new log event |
| `detection` | `detection: Detection` | New possible survivor |
| `command` | `command: CommandResult` | A queued command was accepted or rejected |
| `pong` | `id`, `serverTime` | Reply to `ping` |
| `error` | `code`, `message` | Bad message, or auth failure (followed by close code 4401) |

**Client → server** (`ClientMessage`):

| Message | Meaning |
|---|---|
| `{ "type": "auth", "token": "…" }` | Required within 5 s when auth is on |
| `{ "type": "subscribe", "robotIds": ["rb_atlas"] }` | Only send telemetry for these robots (`"*"` = all, the default) |
| `{ "type": "ping", "id": 1 }` | Latency check / keep-alive |

The server closes connections with code **4000** to simulate a network drop
(`__sim.world.trigger('disconnect')` or `POST /api/sim/trigger`). Your client must reconnect.

Robot `position`/`battery` are only *snapshots* in REST and `robot` messages. The live values are
in `telemetry` frames.

## Simulator controls

These endpoints never need auth and are never delayed or failed.

| Method & path | Body | Effect |
|---|---|---|
| `GET /api/sim/config` | – | current `SimConfig` |
| `PATCH /api/sim/config` | partial config | apply now and remember it (localStorage) |
| `POST /api/sim/reset` | – | rebuild the world from the seed; live connections drop |
| `POST /api/sim/expire-sessions` | – | invalidate every token |
| `POST /api/sim/trigger` | `{ kind, robotId? }` | `fault` · `low-battery` · `detection` · `offline` · `disconnect` |

`SimConfig` fields: `latency: [min, max]` ms · `errorRate` 0–1 · `requireAuth` · `tickMs` ·
`timeScale` (sim seconds per real second, default 2) · `faultRatePerMinute` · `warmupMinutes` · `seed`.

In the browser console the running simulator is `__sim`:

```js
__sim.world.trigger('fault')                 // overheat a random robot's motor
__sim.world.updateConfig({ timeScale: 10 })  // fast-forward
__sim.world.robots.get('rb_atlas')           // peek at state
```

## In tests

`src/mocks/node.ts` exports `createTestBackend()`, with the same handlers on an MSW node server,
zero latency, and a clock that only moves when you call `backend.world.advance(ms)`. See chapter 14.
