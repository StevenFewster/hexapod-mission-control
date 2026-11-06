# Chapter 2 – State, events & effects

> **Goal:** make the fleet page interactive and fetch real data, the hard way first, so
> that you understand exactly what the libraries in later chapters do for you.
> **Time:** 6–8 hours · **New libraries:** none (deliberately)

## What you'll build

A fleet toolbar: search by callsign or serial, filter by status (toggle chips with counts),
sort (callsign, battery, status), grid/list view, and "pin" robots to the top. Data comes from
`GET /api/robots` with loading, error and empty states, refreshed every 10 seconds. Press `/` to
focus search.

## Angular bridge

| Angular | React |
|---|---|
| `signal()` | `useState()` |
| `computed()` | a `const` computed during render (`useMemo` only if expensive) |
| `effect()` | `useEffect()`, but much less often than you think |
| service with a `BehaviorSubject` | lifting state up to the nearest common parent (for now) |
| `ngOnInit` + `HttpClient` | `useEffect` + `fetch` (this chapter), then TanStack Query (chapter 5) |
| `@HostListener('window:keydown')` | `useEffect` that adds and removes a listener |
| `ViewChild` | `useRef` |

**Where it breaks down:** Angular signals are fine-grained; only what reads the signal updates.
React state is coarse: setting state re-runs the **whole component function** (and its
children). That's normally cheap and it's why derived values can simply be recomputed.

---

## 2.1 `useState` and events: the toolbar

Create `features/fleet/components/fleet-toolbar.tsx` and a `FleetPage` component that owns the
state and renders toolbar + grid.

- **Controlled input:** `value={search}` + `onChange={e => setSearch(e.target.value)}`.
  React is the source of truth for the input's value.
- **Status chips:** state is a `Set<RobotStatus>` (empty = all). Each chip shows a count.
- **Sort select** and **view toggle** (`'grid' | 'list'`).
- **Lift state up:** the toolbar receives values and `onXChange` callbacks as props. It owns
  nothing. `FleetPage` owns the state; `FleetGrid` receives the filtered list.

**Learn: derive, don't store.** The filtered, sorted list is **not state**. Compute it in the
body of `FleetPage` from `robots + search + statuses + sort`. If you ever write
`const [filtered, setFiltered] = useState(...)`, stop. That's two sources of truth that will
drift apart.

Event typing tip: let inference work (`onChange={(e) => …}` inline), or use
`ChangeEvent<HTMLInputElement>` for extracted handlers.

## 2.2 Updating state correctly

- **Immutability:** toggling a status must create a **new** `Set`:
  `setStatuses(prev => { const next = new Set(prev); next.has(s) ? next.delete(s) : next.add(s); return next })`.
  Try mutating `prev` and returning it, and watch nothing re-render. React compares by reference
  (`Object.is`).
- **Functional updates** (`prev => …`) whenever the next state depends on the previous one.
- **Pinning:** `pinned: Set<string>` of robot ids. Pinned robots sort first, with a pin button
  in each card's `actions` slot. Click handler: `onTogglePin(robot.id)`. Callbacks flow down,
  events flow up.
- **Batching:** call three setters in one handler and log in the component body: one render.

**Optional exercise:** the toolbar state is four related values. Refactor to `useReducer` with
actions like `{ type: 'toggleStatus', status }`. Compare readability. Neither is wrong, and you'll
move most of this into the URL in chapter 4 anyway.

## 2.3 Fetching with `useEffect` (the hard way)

Replace sample data with a real request:

```tsx
useEffect(() => {
  const controller = new AbortController()
  // set loading, fetch('/api/robots', { signal: controller.signal }), set data or error
  return () => controller.abort()
}, [])
```

Then make it robust, and notice how much code this takes:

1. Loading, error and empty states (use `EmptyState`, and add an `ErrorState` with a Retry
   button that re-runs the fetch. Hint: a `reloadToken` state in the deps array).
2. Open the Network tab: **two requests** in dev. StrictMode mounted, cleaned up and re-mounted.
   The abort in the cleanup is what makes that harmless. Remove the abort and think about what
   could go wrong.
3. Turn on chaos: `fetch('/api/sim/config', { method: 'PATCH', body: JSON.stringify({ errorRate: 0.5, latency: [1000, 3000] }) })`.
   Does your UI hold up? Is there a flash of "empty" before data arrives?
4. **Refresh every 10 s** with `setInterval` inside an effect. Make sure the interval is cleared
   in cleanup. Bonus bug hunt: if your interval callback reads state directly, you'll hit a
   **stale closure**. Find it and fix it.

Keep this code. In chapter 5 you'll delete it with great satisfaction.

## 2.4 Custom hooks

Extract the logic:

- `useRobots()` → `{ robots, status, error, reload }`. The fetch-and-poll logic, out of the page.
- `useDebouncedValue(value, delayMs)`, so search filtering waits for a 200 ms pause in typing.

**Learn:** a custom hook is just a function whose name starts with `use` and which calls other
hooks. It shares **logic**, not state. Two components calling `useRobots()` make two separate
fetches with two separate states. (That's the gap TanStack Query fills.) Rules of hooks: only
call them at the top level of a component or hook, never in conditions or loops, because React
identifies hooks by call order.

## 2.5 Refs, and the effects you actually need

- **DOM ref:** `const searchRef = useRef<HTMLInputElement>(null)`, passed as
  `ref={searchRef}` to the input. (React 19: `ref` is a normal prop on function components too,
  so no `forwardRef` needed when the toolbar passes it down.)
- **Keyboard shortcut:** an effect that adds a `keydown` listener on `window`, focuses the
  search input on `/` (unless you're already typing in a field), and removes the listener in
  cleanup. Extract it to `useHotkey('/', handler)`. Think about what goes in the deps array and
  why the handler may need a ref to stay fresh.
- **Document title:** `"6 robots · Fleet · HMC"`, synced with an effect. This is a legitimate
  effect: you're synchronising with something outside React.

**Learn: effects are for syncing with external systems** (DOM APIs, subscriptions, timers,
network), not for reacting to your own state. Read react.dev → *You Might Not Need an Effect*,
then go through every `useEffect` you've written and justify it out loud.

## 2.6 Test it

```sh
# no new deps – the test backend ships with the simulator
```

1. Create `src/test/backend.ts` with `export const backend = createTestBackend()` (from
   `@/mocks/node`). Then in `src/test/setup.ts`, start it for all tests:
   ```ts
   import { backend } from './backend'
   beforeAll(() => backend.server.listen({ onUnhandledRequest: 'error' }))
   afterEach(() => backend.server.resetHandlers())
   afterAll(() => backend.server.close())
   ```
   jsdom's `fetch` needs absolute URLs. Build request URLs from `window.location.origin` in
   `useRobots`. (Chapter 5's API client will do it properly.)
2. `FleetPage` test: shows a loading state, then six robots; typing "bor" leaves only Borealis;
   clicking the "Fault" chip leaves only Echo. Use `userEvent.setup()` and `findBy…` for async UI.
3. Error test: `backend.server.use(http.get('*/api/robots', () => HttpResponse.json({}, { status: 500 })))`
   → error state with a Retry button that works.
4. `useDebouncedValue` with `renderHook` and `vi.useFakeTimers()`.

---

## Definition of done

- [ ] Search, status chips (with counts), sort, view toggle and pinning all work together
- [ ] Filtered list is derived, never stored
- [ ] Data loads from the API with designed loading / error / empty states and a working retry
- [ ] Refreshes every 10 s without leaking intervals (check by navigating away later, or by
      logging in cleanup)
- [ ] `/` focuses search
- [ ] Tests cover filtering and the error path

## Polish pass

- No layout jump when data arrives: the loading state is a grid of card-shaped skeletons
- Search has a clear button and an `Esc` shortcut
- Status chips show `0` counts dimmed rather than hidden, so the layout stays stable
- The list view is a genuinely useful dense table, not just narrow cards

## Review questions

1. Why is the filtered list not state? What bug would storing it cause?
2. What does the cleanup function do on the first StrictMode re-mount, and why does it matter?
3. What is a stale closure, and how did it show up in your interval?
4. Two components call `useRobots()`. How many requests, and how many copies of the data?
5. Name two effects in your code that are legitimate and one you removed.

## Stretch

- Persist pinned robots in `localStorage` with a `useLocalStorage` hook. Handle JSON parse
  errors, and think about other tabs (the `storage` event).
- Make `useRobots` cancel an in-flight request when a new poll starts, and explain why order of
  responses matters.
