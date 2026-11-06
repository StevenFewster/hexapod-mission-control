# Architecture guide

The target shape of the codebase. You grow into it chapter by chapter; don't create empty
folders up front.

## Folder structure (feature-first)

```
src/
  main.tsx                  # starts the simulator, then renders <App/>
  app/
    App.tsx                 # providers: QueryClient, Router, theme, toasts
    query-client.ts
    router.tsx              # createRouter, router context (queryClient, auth)
  routes/                   # TanStack Router file routes – thin: params, loaders, layout
    __root.tsx
    _app.tsx                # authenticated layout (shell)
    _app.fleet.index.tsx
    _app.fleet.$robotId.tsx
    …
    login.tsx
  features/                 # the real code, grouped by domain
    fleet/
      api.ts                # queryOptions factories + mutations for robots
      schemas.ts            # Zod schemas for Robot, TelemetryFrame…
      components/           # RobotCard, FleetGrid, BatteryMeter…
      hooks/                # useRobotCommand, useFleetFilters…
    missions/
    events/
    detections/
    auth/
    live/                   # WebSocket connection, live store, useTelemetry…
    map/
    twin/
  components/
    ui/                     # shadcn/ui components (generated, then owned by you)
    …                       # shared app components: PageHeader, EmptyState, StatusDot…
  lib/
    api-client.ts           # fetch wrapper, ApiError, auth header, Zod parsing
    cn.ts                   # clsx + tailwind-merge
    format.ts               # units, relative time, numbers
  mocks/                    # the simulated backend (provided – don't import from app code)
  test/
    setup.ts
    render.tsx              # renderWithProviders
```

Rules of thumb:

- **Routes are thin.** A route file declares params/search validation, loaders and which
  feature component to render. Logic lives in `features/`.
- **Features own their API.** `features/fleet/api.ts` is the only place that knows the
  `/api/robots` URLs and query keys.
- **Import direction:** `routes → features → components/lib`. Features may import from other
  features' public `index.ts` only. Nothing imports from `routes/` or `mocks/`.
- Use an `@/` path alias for `src/`.

## Where state lives

The most important table in the course. When you're unsure where something goes, look here.

| Kind of state | Example | Lives in | Why |
|---|---|---|---|
| **Server state** | robots, missions, events, current user | TanStack Query cache | Caching, dedupe, invalidation, retries, background refresh. The server owns it; you hold a copy. |
| **Live stream state** | latest telemetry per robot, rolling 2-minute history | Zustand `liveStore` (written by the socket, read with selectors) | High frequency; must not re-render the whole app. |
| **Push updates to server state** | `robot`, `mission`, `event` messages | Written *into* the Query cache (`setQueryData`) | One source of truth for "what is a robot", whether it came from REST or the socket. |
| **URL state** | filters, sort, selected tab, selected robot on the map | Router search params (Zod-validated) | Shareable, bookmarkable, survives refresh, back button works. |
| **Form state** | mission planner | React Hook Form | Validation, dirty tracking, field arrays. |
| **Global UI state** | sidebar collapsed, map layers, units, theme | Zustand `uiStore` with `persist` | Many components, survives reload. |
| **Local UI state** | a dropdown is open, hover, an input before submit | `useState` in the component | Nobody else cares. |
| **Derived state** | "robots needing attention", battery colour | Computed during render | Never stored. Storing it creates sync bugs. |

**Golden rule:** every piece of state has exactly one owner. If you're copying data from one
place to another with an effect, one of them shouldn't exist.

## Data flow for live data

```
          REST (initial)                      WebSocket (push)
GET /api/robots ──► Query cache ◄── setQueryData ◄── 'robot' / 'mission' / 'event'
                         │                              │
                         ▼                              │ 'telemetry' (2 Hz × 6 robots)
                    components                          ▼
                         ▲                         liveStore (Zustand)
                         └──── useLiveTelemetry(id, selector) ◄──┘
```

The socket client is a plain TypeScript class living **outside** React (`features/live/
connection.ts`). React subscribes to it; it doesn't own it. That keeps reconnection logic
testable, and StrictMode double-mounting can't open two sockets.

## Conventions

- **TypeScript:** `strict`, plus `noUncheckedIndexedAccess`. Types for API data are inferred
  from Zod schemas (`z.infer<typeof robotSchema>`), never hand-written twice.
- **Components:** function declarations, named exports, one component per file unless the
  others are tiny private helpers. Props type named `XProps`.
- **Hooks:** `useX`, live in `hooks/`, return objects (not tuples) once they return more than
  two things.
- **Query keys:** factory per feature, e.g. `robotKeys.detail(id)`; always use `queryOptions()`.
- **Styling:** Tailwind utilities; `cn()` for conditional classes; variants with `cva`. Don't
  write custom CSS unless Tailwind can't express it.
- **Naming:** files `kebab-case.tsx`, components `PascalCase`, event handler props `onX`,
  handler functions `handleX`.
- **Commits:** Conventional Commits (`feat(fleet): live battery on robot cards`).
