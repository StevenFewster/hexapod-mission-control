# Chapter 5 – Server state

> **Goal:** treat server data as a cache, not as state you manage. Real data on every page,
> resilient to latency and failures, with mutations and optimistic updates.
> **Time:** 8–10 hours · **New libraries:** TanStack Query (+ devtools), Zod (parsing at the edge),
> react-error-boundary

## What you'll build

- A typed API client that validates every response with Zod.
- Fleet, robot detail, missions list and the status strip, all driven by queries, with
  instant back-navigation (cached), preloading on hover, and skeletons on first load.
- Inline **rename robot** with optimistic update and server validation errors.
- A robot overview tab showing its current mission and recent events (dependent and parallel
  queries).
- An app that stays usable with the simulator set to 30% errors and 2 s latency.

## Angular bridge

| Angular | TanStack Query |
|---|---|
| `HttpClient.get()` in a service | `queryOptions({ queryKey, queryFn })` factory |
| `shareReplay(1)` / caching in a service | The query cache, keyed by `queryKey` |
| `HttpInterceptor` | Your `apiFetch` wrapper (+ QueryClient defaults) |
| Resolver | Route `loader` calling `queryClient.ensureQueryData(...)` |
| Manual refresh after a save | `invalidateQueries({ queryKey })` |
| Optimistic update by hand | `onMutate` / rollback in `onError`, or `useOptimistic` |
| `retry()` / `catchError` | `retry`, error boundaries, `throwOnError` |

**Where it breaks down:** stop thinking "I fetch data and put it in state". Think "this
component **subscribes** to a cache entry; the library decides when to fetch". Most of your
`useState`/`useEffect` data code disappears.

---

## 5.1 The API client and schemas

`src/lib/api-client.ts`:

```ts
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) { super(message) }
}

export async function apiFetch<T>(path: string, options: { schema: z.ZodType<T>; method?: string; body?: unknown; signal?: AbortSignal }): Promise<T>
```

(If your tsconfig has `erasableSyntaxOnly`, which the Vite template sets, constructor
*parameter properties* aren't allowed. Declare the fields normally.)

- Builds an absolute URL (`new URL(path, window.location.origin)`), sets JSON headers, parses
  error bodies into `ApiError` (see the error format in `docs/API.md`), handles `204`, and
  **parses success bodies with the schema**. A contract change becomes a clear error at the
  edge instead of `undefined` somewhere in a component.
- Schemas in `features/*/schemas.ts`: `robotSchema`, `telemetryFrameSchema`, `missionSchema`,
  `fleetEventSchema`, `pageSchema(item)`, `detectionSchema`, `statsSchema`. Infer types with
  `z.infer`, then **delete** the hand-written types from chapter 1.
- Use `z.enum([...])` for statuses and reuse them (the fleet search schema can now import
  `robotStatusSchema`).

## 5.2 QueryClient and the first queries

```sh
npm i @tanstack/react-query
npm i -D @tanstack/react-query-devtools
```

- Create the `QueryClient` in `src/app/query-client.ts` with sensible defaults (e.g.
  `staleTime: 10_000`; no retries on 4xx, where a `retry` function checks `ApiError.status`).
- `features/fleet/api.ts`:
  ```ts
  export const robotQueries = {
    all: () => ['robots'] as const,
    list: () => queryOptions({ queryKey: [...robotQueries.all(), 'list'], queryFn: ({ signal }) => apiFetch('/api/robots', { schema: z.array(robotSchema), signal }) }),
    detail: (id: string) => queryOptions({ queryKey: [...robotQueries.all(), 'detail', id], queryFn: … }),
  }
  ```
- Replace `useRobots()` with `useQuery(robotQueries.list())`. Delete the chapter 2 fetch code.
  Polling becomes `refetchInterval: 10_000`, one line.
- Open the Query devtools. Navigate away and back (instant, from cache), focus the window
  (background refetch), and render the list in two places (one request).

## 5.3 Router + Query: loaders and Suspense

- Put `queryClient` in the **router context** (`createRootRouteWithContext<{ queryClient: QueryClient }>()`).
- `/fleet/$robotId` loader: `context.queryClient.ensureQueryData(robotQueries.detail(params.robotId))`.
  On a 404 `ApiError`, `throw notFound()`.
- In components, `useSuspenseQuery(robotQueries.detail(robotId))`: `data` is never undefined,
  because loading is handled by the route's `pendingComponent` (a skeleton of the robot page).
- With `defaultPreload: 'intent'`, hovering a robot card now preloads **code and data**. Watch
  the Network tab.

**Learn: Suspense.** A component "suspends" while its data isn't ready; the nearest
`<Suspense>`/pending boundary shows a fallback. Loading UI is declared by **where you put the
boundary**, not by `if (isLoading)` in every component.

`useQuery` or `useSuspenseQuery`? Suspense where a route guarantees the data (via its loader);
`useQuery` for optional, secondary or background data where you want inline loading states.

## 5.4 Errors that don't take the page down

```sh
npm i react-error-boundary
```

- Wrap independent widgets (status strip counts, a robot's recent events) in their own
  `ErrorBoundary` with a compact fallback and a retry wired to `QueryErrorResetBoundary`.
  One failing panel must not blank the page.
- Global mutation error toasts via `new MutationCache({ onError })`, unless a mutation handles
  its own errors (use `meta` to opt out).
- Chaos test: `PATCH /api/sim/config { "errorRate": 0.3, "latency": [500, 2000] }`. Click
  around for two minutes and fix everything that looks broken or janky. Then set it back.

## 5.5 Mutations: rename a robot

On the robot header, the callsign is **inline-editable** (click → input → Enter saves, Esc
cancels).

1. `useMutation` calling `PATCH /api/robots/:id`. On success, `setQueryData` for the detail and
   `invalidateQueries` for the list. Know why you'd choose each.
2. Show a **422** inline: try a duplicate callsign ("Atlas") and display `fieldErrors.callsign`.
3. **Optimistic update:** in `onMutate`, cancel outgoing queries, snapshot, write the new
   callsign into the cache; roll back in `onError`; invalidate in `onSettled`. Test it with
   `errorRate: 1` and watch it roll back.
4. Compare with React 19's **`useOptimistic`**: implement the same on a small "notes" field.
   Which fits better when the data lives in a shared cache vs local to one component?

Also wire up: the **missions list** page (grouped by status, progress `currentWaypointIndex /
waypoints.length`) and the **status strip** counts from `GET /api/stats` (`refetchInterval:
15_000` for now; chapter 7 makes it live).

## 5.6 Dependent, parallel and derived queries

On the robot Overview tab:

- **Current mission:** depends on `robot.missionId`. Use `enabled: !!missionId` or `skipToken`.
- **Recent events** for this robot (`/api/events?robotId=…&limit=10`), in parallel.
- **"Needs attention"** on the fleet page (low battery, faults, offline) uses `select` on the
  list query to derive it. No extra request, no extra state.
- Prefetch the missions list when hovering the Missions nav item.

## 5.7 Test it

- `renderWithProviders` now creates a **fresh QueryClient per test** (`retry: false`,
  `gcTime: Infinity`) plus the router. Shared clients leak cache between tests.
- Tests:
  - fleet page renders robots from the test backend
  - a robot route with an unknown id shows not-found
  - rename: success updates the header; a duplicate shows the field error
  - optimistic rollback: override the PATCH to return 500, then assert the old name returns and a
    toast appears
  - a failing stats endpoint shows the compact error and the rest of the page still works

---

## Definition of done

- [ ] Every response is Zod-parsed; no hand-written API types remain
- [ ] No `useEffect` data fetching left anywhere
- [ ] Robot route loads via loader + Suspense, with preloading on hover
- [ ] Granular error boundaries; app survives 30% errors gracefully
- [ ] Rename works with optimistic update, rollback and server field errors
- [ ] Query key factories per feature; no inline string keys in components

## Polish pass

- First loads show skeletons; refetches show a subtle "updating" indicator, never a skeleton
- Stale data is shown while refetching (no flicker back to loading)
- Error messages are human ("Couldn't load missions") with a retry, not raw status codes
- The browser tab title shows the robot callsign once loaded

## Review questions

1. What's the difference between `staleTime` and `gcTime`?
2. Why parse responses with Zod when TypeScript already has types?
3. When would you `invalidateQueries` vs `setQueryData` after a mutation?
4. Walk through the optimistic update: what's in the snapshot and when is it used?
5. Why one error boundary per widget instead of one for the page?

## Stretch

- An `ApiError`-aware `<QueryState query={…}>` component that renders loading/error/empty/success
  slots. Is it worth it compared with Suspense + boundaries? Discuss.
- Look at the Query devtools while the app polls. Are you over-fetching anything?
