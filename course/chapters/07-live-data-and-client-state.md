# Chapter 7 – Live data & client state

> **Goal:** connect to the live WebSocket feed, keep high-frequency telemetry out of React's way,
> update the server-state cache from pushes, and send robot commands with real feedback.
> **Time:** 8–10 hours · **New libraries:** Zustand

## What you'll build

- A `LiveConnection` that connects, authenticates, measures latency and reconnects with backoff.
  The status strip shows **LIVE · 23 ms**, **Reconnecting…** or **Offline**.
- Fleet cards with live battery, speed and status, updating twice a second without re-rendering
  the page.
- Robot command buttons (stop, resume, return home, dock, gait, clear fault, reboot) that go
  pending → accepted/rejected, with the robot's reason shown.
- Preferences (units, map layers, sidebar, theme) in a persisted store.

## Angular bridge

| Angular / RxJS | React |
|---|---|
| `webSocket()` subject in a service | A plain TS class outside React, exposing `subscribe` |
| `retry({ delay })` with backoff | Your reconnect loop (you write it, and test it) |
| `async` pipe on a stream | `useSyncExternalStore` or a Zustand selector |
| `BehaviorSubject` state service | Zustand store |
| `distinctUntilChanged` + `map` | Zustand **selectors**: components re-render only when *their* slice changes |
| `OnPush` to avoid re-renders | Selecting tiny slices; components that don't read live data don't re-render |

**Where it breaks down:** pushing 12 messages a second into `useState` at the top of the tree
re-renders everything below it, many times a second. The skill here is **where to put the
data so that only the components showing it re-render.**

---

## 7.1 The connection, outside React

`features/live/connection.ts`: a class with no React imports.

- `connect()` opens `new WebSocket('wss://live.hexapod.local/v1')`. If auth is on, it sends
  `{ type: 'auth', token }` on open.
- **State machine:** `idle → connecting → open → reconnecting → closed`, exposed via
  `getState()` and `subscribe(listener)`.
- **Reconnect** with exponential backoff and jitter (e.g. 0.5 s, 1 s, 2 s… capped at 15 s),
  reset on a successful connection. Don't reconnect after a deliberate `close()` or a 4401
  (unauthorised: hand off to the auth flow instead).
- **Latency:** send `ping` every 5 s and compute the round trip from `pong`.
- **Parsing:** validate every message with a Zod **discriminated union** on `type`
  (`z.discriminatedUnion('type', [...])`). Log and drop invalid messages; never crash.
- **Fan-out:** `onMessage(listener)` for typed messages.

Create **one** instance in a module (`export const live = new LiveConnection(...)`) and start it
when the user is authenticated (and stop it on logout). Not in a component.

**Why outside React?** StrictMode mounts effects twice; a socket owned by a component would open
twice or flap. A module-level connection is also trivial to unit-test, and it's how you'd share it
with a Web Worker later.

## 7.2 `useSyncExternalStore`: connection status

```ts
export function useConnectionState() {
  return useSyncExternalStore(live.subscribe, live.getState)
}
```

Use it in the status strip: a pulsing **LIVE** dot with latency, amber **Reconnecting… (attempt 3)**,
grey **Offline**. Make `getState` return the *same object* when nothing changed. Find out why
returning a new object every time causes an infinite loop.

Test it: `__sim.world.trigger('disconnect')` in the console. The strip should go amber and then
recover by itself.

**Learn:** `useSyncExternalStore` is React's official hook for subscribing to *anything*
outside React (stores, browser APIs, your socket) without tearing. Zustand, Redux and Query use
it internally.

## 7.3 Zustand for live telemetry

```sh
npm i zustand
```

`features/live/live-store.ts`:

```ts
type LiveState = {
  latest: Record<string, TelemetryFrame>
  history: Record<string, TelemetryFrame[]>   // rolling ~2 minutes per robot
  ingest: (frame: TelemetryFrame) => void
}
export const useLiveStore = create<LiveState>()((set) => ({ … }))
```

- The connection writes with `useLiveStore.getState().ingest(frame)`, **outside React**.
- Components read **tiny slices**: `useLiveStore((s) => s.latest[robotId]?.battery.percent)`.
  A card's battery meter re-renders when *that* number changes, and nothing else does.
- Selecting objects or arrays? Use `useShallow` (or select primitives) to avoid re-rendering on
  every new reference.
- Write a hook API so components don't know the store's shape:
  `useLiveBattery(robotId)`, `useLiveTelemetry(robotId, selector)`.
- Make the fleet cards live: battery, speed, heading arrow, and "last seen" for offline robots.

Turn on React DevTools → *Highlight updates*. Only the live numbers should flash, not the whole
grid. If the grid flashes, fix your selectors.

## 7.4 Pushes into the Query cache

Robots, missions and events are **server state**, and they already live in the Query cache.
When the socket says something changed, update the cache. Don't create a second copy.

| Message | What to do |
|---|---|
| `hello` | `setQueryData` for the robot list (fresh snapshot after every reconnect) |
| `robot` | update that robot in `robotQueries.detail(id)` and in the list |
| `mission` | update `missionQueries.detail(id)`; invalidate mission lists |
| `event` | invalidate `stats` (chapter 11 handles the log itself) |
| `detection` | invalidate detections; show a toast "Possible survivor near Borealis" with a "View" action |

Put this in one place: `features/live/sync-cache.ts`, subscribed once at startup with access to
the `queryClient`. Now you can **remove the polling** (`refetchInterval`) from the robot list and
stats. Push replaces poll.

## 7.5 Commands with feedback

`useRobotCommand(robotId)` returns `send(command)` plus per-command pending state.

1. `POST /api/robots/:id/commands` → `202 { commandId, status: 'pending' }`.
2. Wait for the matching `{ type: 'command', command: { commandId, status } }` from the socket.
   Build a small pending-commands registry (a `Map<commandId, resolve>` in the connection or a
   store) with a **timeout** (e.g. 10 s → "No response from robot").
3. UI: the button shows a spinner while pending; then a toast. Accepted is quiet and short;
   rejected is louder and includes `reason` ("Motor still hot (78 °C) – wait until below 60 °C").
4. Robot status arrives separately via the `robot` message. Don't fake it optimistically.
   Show "Stopping…" until the real status arrives. (Why is optimistic UI wrong here?)
5. A **command bar** on the robot page and in each card's menu. Disable commands that make no
   sense for the current status (e.g. `resume` only when holding), confirm `reboot` and
   `return-home` with `useConfirm()`, and respect `robot:command` permission.

Try Echo: "Clear fault" is rejected for the first minute (motor hot), then accepted.

## 7.6 UI preferences with `persist`, then test it

`stores/ui-store.ts` with Zustand `persist` middleware: `units` (metric/imperial), `timeZone`
display (UTC/local), `sidebarCollapsed`, `mapLayers` (for chapter 9), and `theme`. Migrate your
chapter 3 `ThemeProvider` from Context to this store and compare the code. Context vs Zustand,
in your own words, goes in `docs/decisions.md`.

Tests:
- `LiveConnection`: connects and receives `hello`; reconnects after the server closes with 4000
  (use `backend.world.trigger('disconnect')`); stops on 4401. Use fake timers for backoff.
  (MSW's WebSocket interception works in Node 22, which has a global `WebSocket`.)
- `live-store`: `ingest` caps history length; selectors return stable values.
- `useRobotCommand`: stop Borealis → pending → `backend.world.advance(1000)` → accepted toast.
- A `robot` push updates a robot card's status without refetching (assert there is no second
  `GET /api/robots`).

---

## Definition of done

- [ ] One socket per session, created outside React, with backoff reconnect and auth
- [ ] Connection status in the strip via `useSyncExternalStore`
- [ ] Telemetry in Zustand; only live values re-render (verified with highlight updates)
- [ ] Pushed robot/mission changes update the Query cache; polling removed
- [ ] Commands show pending → accepted/rejected with reasons; permissions respected
- [ ] Preferences persisted; theme migrated

## Polish pass

- Numbers that update live don't shift layout (fixed widths, tabular numbers)
- Stale indicator: if a robot hasn't sent telemetry for 3 s while online, its card says so
- Reconnecting doesn't spam toasts; one "Connection restored" when it comes back
- `prefers-reduced-motion` disables the LIVE pulse

## Review questions

1. Why does the socket live outside React?
2. What does `useSyncExternalStore` protect you from?
3. Why must selectors return stable references?
4. Why push robot updates into the Query cache instead of a Zustand store?
5. Why is optimistic UI the wrong choice for robot commands?

## Stretch

- Move telemetry parsing and the ring buffers into a **Web Worker** and post batched updates
  to the main thread. Measure whether it helps.
- Throttle store writes to animation frames (`requestAnimationFrame` batching) and compare
  render counts.
