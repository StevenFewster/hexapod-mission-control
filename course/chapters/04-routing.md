# Chapter 4 – Routing

> **Goal:** every page of the app, nested layouts, type-safe links and params, and filters that
> live in the URL.
> **Time:** 6–8 hours · **New libraries:** TanStack Router (+ Vite plugin, devtools), Zod

## What you'll build

Real navigation: `/fleet`, `/fleet/$robotId` (with Overview / Telemetry / Twin / Log tabs as
child routes), `/map`, `/missions`, `/missions/new`, `/missions/$missionId`, `/events`,
`/detections`, `/settings`, a 404 page, and `/` redirecting to `/fleet`. The fleet filters from
chapter 2 move into the URL (`/fleet?status=fault,offline&sort=battery&q=bo`), so they're
shareable and survive reload.

## Why TanStack Router?

The two serious options are **React Router v7** (most widely used, also a full-stack framework)
and **TanStack Router** (newer, fully type-safe routes, params and search params, with first-class
loaders and caching that pairs with TanStack Query). This course uses TanStack Router because the
type safety teaches good habits and the search-param handling is the best available. Concepts
transfer directly; there's a comparison table in [`angular-to-react.md`](../angular-to-react.md).

## Angular bridge

| Angular Router | TanStack Router |
|---|---|
| `Routes` array | File-based routes in `src/routes/`, compiled into a typed route tree |
| `<router-outlet>` | `<Outlet />` |
| `routerLink`, `routerLinkActive` | `<Link to params search activeProps>`, all type-checked |
| `ActivatedRoute.paramMap` | `Route.useParams()` |
| `queryParamMap` (strings) | `Route.useSearch()`: **validated, typed objects** |
| Resolvers | `loader` |
| `canActivate` | `beforeLoad` |
| `loadComponent` | Automatic code splitting |

**Where it breaks down:** search params are treated as **first-class typed state**, not strings
you parse. And the route tree is generated from files, so a typo in `to="/fleet/$robotid"` is a
compile error.

---

## 4.1 Install and the root route

```sh
npm i @tanstack/react-router zod
npm i -D @tanstack/router-plugin @tanstack/react-router-devtools
```

Follow the **file-based routing with Vite** guide on tanstack.com/router:

- Add the router plugin to `vite.config.ts` **before** `react()`, with `autoCodeSplitting: true`.
- Create `src/routes/__root.tsx` (renders `<Outlet />`, the devtools in dev, and your
  `Toaster`/`ConfirmProvider`).
- Create the router in `src/app/router.tsx`, render `<RouterProvider router={router} />`, and
  **register the router type** (`declare module '@tanstack/react-router' { interface Register … }`).
  This is what makes every `Link` type-safe.

Run `npm run dev` and look at the generated `routeTree.gen.ts`. Commit it (it's generated but
used by the type checker), and exclude it from lint and format.

## 4.2 Layouts and pages

- A **pathless layout** `_app.tsx` that renders your `AppShell` around an `<Outlet />`. All
  main pages live under it. (`/login` in chapter 6 won't.)
- Pages: create a file per route with a `PageHeader` placeholder. Use flat (`_app.fleet.index.tsx`)
  or directory naming, whichever you prefer, but be consistent.
- `/` redirects to `/fleet`: `beforeLoad: () => { throw redirect({ to: '/fleet' }) }`.
- Nav rail: replace placeholders with `<Link>` (via `Button asChild`). Use `activeProps` to style
  the active item and set `aria-current="page"`.
- Move `FleetPage` into the `/fleet` route. The route file stays **thin**; the page component
  lives in `features/fleet` (see [`architecture.md`](../architecture.md)).

## 4.3 Params and nested routes

- `/fleet/$robotId`: a layout showing the robot header (callsign, status) and **tabs as links**
  to child routes: index (Overview), `telemetry`, `twin`, `log`. The tab bar uses `Link`s styled
  like tabs, so the selected tab is in the URL and the back button works.
- Read the param with `Route.useParams()`. For now, find the robot in the data you fetch with
  `useRobots()` from chapter 2. Proper per-route data loading comes in chapter 5.
- Make each fleet card a link to its robot (the whole card clickable, with a single `<a>`;
  look up the "stretched link" pattern).

Try to break it: write `<Link to="/fleet/$robotId">` without `params`, or misspell a route.
TypeScript catches both.

## 4.4 Search params as state

Move the fleet filters into the URL:

```ts
const fleetSearchSchema = z.object({
  q: z.string().optional(),
  status: z.array(robotStatusSchema).optional(),
  sort: z.enum(['callsign', 'battery', 'status']).default('callsign'),
  view: z.enum(['grid', 'list']).default('grid'),
})
// in the route: validateSearch: fleetSearchSchema
```

(Recent TanStack Router versions accept a Zod 4 schema directly via Standard Schema. Older
docs show `zodValidator` from `@tanstack/zod-adapter`; check which yours needs.)

- Read with `Route.useSearch()`, write with `navigate({ search: (prev) => ({ ...prev, sort }) })`.
- Search typing writes to the URL **debounced**, with `replace: true` so each keystroke doesn't
  create a history entry.
- Keep URLs clean: defaults shouldn't appear in the URL (look up search middlewares /
  `stripSearchParams`).
- Delete the `useState`s from chapter 2 that this replaces. The URL is now the single owner.
- Bad input (`?sort=banana`) must not crash the page. Decide whether to fall back to defaults
  (`.catch()`) or show an error, and justify it.

## 4.5 Not found, errors, pending, titles

- A global `notFoundComponent` (a good-looking 404 with a link home) and a `defaultErrorComponent`
  (an `ErrorState` with retry via `router.invalidate()`).
- On `/fleet/$robotId`, an unknown id should show a robot-specific not-found. You'll `throw notFound()`
  from the loader next chapter; for now, render it conditionally.
- `defaultPendingComponent` and `defaultPendingMs`, so fast navigations don't flash a spinner.
- **Document titles** per route (`Borealis · Fleet · HMC`). Look at the router's `head` route
  option with `<HeadContent />`, or write a `useDocumentTitle` hook. Pick one and apply it everywhere.

## 4.6 Code splitting & test it

- `npm run build` and look at `dist/assets`. Each route is its own chunk. Open the Network tab
  and watch chunks load as you navigate.
- Add `defaultPreload: 'intent'` to the router: hovering a link preloads its code (and, from
  chapter 5, its data).
- **Testing routed components:** write a `renderWithRouter(ui, { initialUrl })` helper using
  `createMemoryHistory` and your route tree. Tests:
  - `/fleet?status=fault` shows only Echo, and clicking another chip updates the URL
  - navigating to `/fleet/rb_nope` shows the robot not-found
  - `/` redirects to `/fleet`

---

## Definition of done

- [ ] All routes exist inside the shell with active nav state and titles
- [ ] Robot detail has tab child routes that work with back/forward
- [ ] Fleet filters live only in the URL, validated, defaults stripped
- [ ] Invalid URLs never crash; 404s are designed
- [ ] Route-level code splitting visible in the build
- [ ] Routing tests pass

## Polish pass

- Focus moves to the page `<h1>` after navigation (screen readers otherwise get no feedback),
  and scroll position resets
- Hovering nav items preloads them
- Browser back after changing filters restores the previous filters

## Review questions

1. Why is the URL the right owner for filters? What did you delete as a result?
2. What does registering the router type give you?
3. Why debounce the search param and use `replace: true`?
4. What's a pathless layout route, and why is `_app` one?
5. How does the router know which chunk to load for a route?

## Stretch

- Persist the last-used fleet view (grid/list) when the URL doesn't specify it. Where should
  that preference live? (Revisit in chapter 7.)
- Read the React Router v7 docs for the same features and write three sentences on the
  differences. Good interview material.
