# Bonus A – Public status page with Next.js

> **Goal:** meet the other half of modern React (Server Components, Server Actions, streaming
> and server caching) by building a small public companion site in Next.js.
> **Time:** 6–8 hours · **New libraries:** Next.js (App Router)

## Why this chapter

Your main app is a client-rendered SPA, the right choice for a live, authenticated console.
But a large share of React jobs use **Next.js**, and **React Server Components (RSC)** change how
you think about data fetching. This bonus gives you hands-on experience in a setting where
server rendering is genuinely the right tool: a public, SEO-friendly, mostly-read page.

## What you'll build

`status-page/`: a separate Next.js app in the same repo.

- `/`: public fleet status: overall state ("All systems operational" / "Degraded"), robots by
  status, active missions with progress, critical incidents in the last 24 h. Rendered on the
  server, streamed in sections.
- `/robots/[id]`: a public robot profile with static metadata and an Open Graph image.
- A **"Report a hazard"** form (Server Action) that adds a warning to the fleet log.
- `GET /api/status`: a JSON route handler.

## Angular bridge

| Angular | Next.js |
|---|---|
| Angular Universal / SSR + hydration | Server Components render on the server **and never ship their JS**; only `'use client'` components hydrate |
| `TransferState` | Not needed: server components pass serialisable props to client components |
| Resolvers on the server | `async` server components that `await` data directly |
| Route guards | Middleware / checks in server components |

---

## A.1 Scaffold and the server-side simulator

```sh
npx create-next-app@latest status-page --typescript --tailwind --app --eslint
```

The simulator core (`world.ts`, `api.ts`, `seed.ts`, `types.ts`, `util.ts`, `config.ts`) has no
browser dependencies, so it runs on the server too. Copy those files into
`status-page/lib/sim/` (or see the stretch goal for sharing them properly).

Create a server-only module that holds **one** world per server process:

```ts
import 'server-only'
const g = globalThis as unknown as { world?: World }
export function getWorld() {
  g.world ??= new World({ ...defaultConfig })
  g.world.advance(Math.min(Date.now() - g.world.now, 60_000)) // catch up lazily
  return g.world
}
```

On serverless hosts processes come and go, so the world resets now and then. That's fine for a
demo, and worth one sentence in the README about why real systems keep state in a database.

## A.2 Server Components

- `app/page.tsx` is an `async` component that reads `getWorld()` directly. No `fetch`, no API
  layer, no loading state in the component.
- Split the page into sections (`<FleetSummary/>`, `<ActiveMissions/>`, `<Incidents/>`), each an
  async server component wrapped in `<Suspense fallback={<Skeleton/>}>`. Add an artificial
  delay to one to see **streaming**: the page shell arrives first, and sections pop in.
- Reuse styling ideas from the main app (tokens, fonts) but not its components, which are
  client components full of hooks. Notice which of them *could* be server components.
- Check the browser's JS payload. Server components shipped none of their code.

## A.3 Client islands

- A live "last updated 12 s ago" ticker and a manual refresh button need `'use client'`.
- Refresh uses `router.refresh()`: it re-runs the server components and merges the result
  without losing client state.
- Rule of thumb: push `'use client'` to the **leaves**. A client component can render server
  components passed as `children`, but can't import them.

## A.4 Caching and revalidation

Next.js caching has changed between major versions, so **read the current docs** for your
installed version (look for `revalidate`, `'use cache'`, `cacheLife`/`cacheTag`, and dynamic
rendering). Then:

- The status page can be at most ~10 seconds stale.
- Robot profile pages are generated per robot (`generateStaticParams`) and revalidated.
- After a hazard report (A.5), the incidents section revalidates immediately (tag-based or
  path-based revalidation).

Write down, in your own words, which data is cached where and for how long.

## A.5 Server Actions

"Report a hazard": description, location (pick on a small client-side map, or choose a sector),
severity.

- A `'use server'` action validates with Zod and calls
  `getWorld().log('warning', 'system', 'PUBLIC_REPORT', …)`, then revalidates the incidents.
- The form uses `useActionState` and `useFormStatus`, the same APIs as your login page, now
  with the action running **on the server**. It works without JavaScript; try it with JS
  disabled.
- Rate-limit by IP in memory (simple and imperfect; say why in a comment).

## A.6 Polish & ship

- `generateMetadata` per page; a dynamic **Open Graph image** for robot pages with `next/og`
  (callsign, status, battery).
- `GET /api/status` route handler returning a summary JSON with cache headers.
- Deploy to Vercel as a second project. Link the status page from the main app's login screen,
  and vice versa.

---

## Definition of done

- [ ] Status page renders on the server and streams sections
- [ ] Only the small interactive pieces are client components
- [ ] Caching and revalidation are deliberate and documented
- [ ] Hazard report works via Server Action, with and without JavaScript
- [ ] Metadata + OG images; deployed

## Review questions

1. What exactly does a Server Component not send to the browser?
2. Why can't a client component import a server component, and how do you compose them anyway?
3. When would you choose Next.js over a Vite SPA, and why was the SPA right for the console?
4. What does `router.refresh()` do that a full reload doesn't?
5. How does a Server Action differ from writing an API route and calling `fetch`?

## Stretch

- Turn the repo into **npm workspaces** with a shared `packages/simulator` used by both apps,
  instead of copying files.
- Rebuild the status page in **React Router v7 framework mode** (loaders/actions on the server)
  and compare it with Next.js.
