# The React path: building Hexapod Mission Control

A course for an experienced **Angular** developer to become a confident, idiomatic **React**
developer. You build one substantial, portfolio-quality app from an empty folder to a deployed
product, 16 chapters at a time, each split into small sections.

**The app:** a command centre for a fleet of six-legged search-and-rescue robots. Live telemetry,
an operations map, a mission planner, a 3D digital twin, an event log with thousands of rows, and
role-based access. All of it runs against a realistic simulated backend that's already written
for you ([`docs/API.md`](../docs/API.md)), so every chapter is about React, not plumbing.

## Who this is for

- You have 8 years of Angular and strong JavaScript/TypeScript. You know components, routing,
  DI, RxJS, forms, change detection and testing, and you don't need any of them explained as
  concepts.
- What you need is React's **different mental model** (render functions, hooks, one-way data,
  "state lives somewhere specific"), its idioms, and the **ecosystem**: React is a library, so
  half of being good at React is knowing which third-party libraries to reach for and how to
  integrate them well.

Every chapter has an **Angular bridge** that maps what you know to the React way, and calls out
where the analogy breaks. There's a full cheat sheet in [`angular-to-react.md`](angular-to-react.md).

## How it works

1. Read the chapter brief in [`chapters/`](chapters/). Each one has 4–8 **sections**. A section is
   one sitting (30–90 minutes) with a clear result.
2. Open a chat with Claude, point it at this repo and say **"let's start chapter N"** (or
   "section 5.3"). Claude follows [`COACHING.md`](COACHING.md): it introduces one idea at a time,
   gives hints before answers, reviews your code, and won't write the app for you unless you ask.
3. Write the code. Commit at the end of every section (each brief suggests a message).
4. Before moving on, tick the chapter's **definition of done** and do its **polish pass**. The
   polish passes are what turn this from a tutorial project into a portfolio piece.
5. Update [`PROGRESS.md`](PROGRESS.md).

## The chapters

| # | Chapter | You build | Main React ideas | Libraries | Hours |
|---|---|---|---|---|---|
| 0 | [Launch prep](chapters/00-launch-prep.md) | Tooling, simulator wired in, first render | How React runs, JSX, StrictMode, project layout | Vite, TypeScript, ESLint, Prettier, Vitest, MSW | 3–4 |
| 1 | [Components & JSX](chapters/01-components-and-jsx.md) | Robot cards and the fleet grid | Components, props, children, lists & keys, conditional rendering | Tailwind CSS v4, clsx, tailwind-merge | 5–6 |
| 2 | [State, events & effects](chapters/02-state-events-effects.md) | Filterable fleet view, first data fetch | `useState`, derived state, lifting state, `useEffect` (and avoiding it), custom hooks, refs | – | 6–8 |
| 3 | [Design system](chapters/03-design-system.md) | App shell, themed components, toasts | Composition, compound components, `asChild`, variants, `ref` as a prop, accessibility | shadcn/ui (Radix), cva, lucide-react, sonner | 6–8 |
| 4 | [Routing](chapters/04-routing.md) | Every page, nested layouts, URL-driven filters | File-based routes, layouts/outlets, type-safe params & search params, code splitting | TanStack Router, Zod | 6–8 |
| 5 | [Server state](chapters/05-server-state.md) | Real data everywhere, robot rename | Queries, caching, Suspense, error boundaries, mutations, optimistic updates | TanStack Query, Zod, react-error-boundary | 8–10 |
| 6 | [Auth & permissions](chapters/06-auth-and-permissions.md) | Login, guarded routes, role-based UI | Context, React 19 Actions (`useActionState`, `useFormStatus`), route guards | (TanStack Router & Query) | 5–6 |
| 7 | [Live data & client state](chapters/07-live-data-and-client-state.md) | WebSocket link, live fleet, robot commands | External stores, `useSyncExternalStore`, Zustand, cache updates from push, reconnection | Zustand | 8–10 |
| 8 | [Telemetry charts](chapters/08-telemetry-charts.md) | Live charts and instrument gauges | Rendering performance, `memo`, React Compiler, `useDeferredValue`, Profiler, SVG in JSX | Recharts | 6–8 |
| 9 | [Operations map](chapters/09-operations-map.md) | Live map, trails, detections triage | Wrapping imperative libraries, refs, effects for sync, cleanup | MapLibre GL, react-map-gl | 8–10 |
| 10 | [Mission planner](chapters/10-mission-planner.md) | Multi-step form with map-drawn route | Complex forms, field arrays, form ↔ map sync, server errors, navigation blocking | React Hook Form, Zod, dnd-kit, date-fns | 10–12 |
| 11 | [Event log at scale](chapters/11-event-log-at-scale.md) | 5,000+ row live log with bulk actions | Headless UI, infinite queries, virtualisation, `useTransition` | TanStack Table, TanStack Virtual | 8–10 |
| 12 | [Digital twin](chapters/12-digital-twin.md) | 3D hexapod driven by telemetry | Declarative 3D, render loops outside React, refs over state, lazy loading | three, React Three Fiber, drei | 8–10 |
| 13 | [Motion, polish & accessibility](chapters/13-motion-polish-a11y.md) | Animations, command palette, chaos panel | Layout animation, presence, portals, focus management, a11y | Motion, cmdk | 8–10 |
| 14 | [Testing in depth](chapters/14-testing-in-depth.md) | Integration, E2E and visual tests, Storybook | Testing behaviour, not implementation | Testing Library, MSW, Playwright, Storybook | 8–10 |
| 15 | [Ship it](chapters/15-ship-it.md) | CI, deploy, monitoring, case study | Production builds, performance budgets | GitHub Actions, Vercel/Netlify, Sentry | 6–8 |
| A | [Bonus: public status page](chapters/bonus-a-nextjs-status-page.md) | A Next.js companion site | Server Components, Server Actions, streaming | Next.js | 6–8 |
| B | [Bonus: offline & international](chapters/bonus-b-pwa-and-i18n.md) | Installable PWA, two languages | Service workers, locale-aware formatting | vite-plugin-pwa, react-i18next | 4–6 |

**Total:** about 120–150 hours, or roughly 3–4 months at 8–10 hours a week.

Testing isn't saved up for chapter 14: every chapter has a **Test it** section. Chapter 14 adds
the layers that only make sense once the app exists (E2E, visual, Storybook).

## Ground rules for a polished result

These come back in every review. The full definition is in [`design-brief.md`](design-brief.md).

1. **Every async thing has four states:** loading, empty, error, success. Each one is designed,
   not left to default.
2. **TypeScript strict, no `any`**, and no ESLint warnings committed.
3. **Every interactive element works with a keyboard** and has an accessible name.
4. **State lives in exactly one place.** [`architecture.md`](architecture.md) says where.
5. **Commit like a professional:** small commits, conventional messages, a PR per chapter if
   you want the practice.

## Reference

- [react.dev](https://react.dev) – the official docs. *Learn* and *Reference* are both excellent;
  read "You Might Not Need an Effect" twice.
- Each library's own docs. They move faster than any course, so when this course and the docs
  disagree, **the docs win** (and tell Claude, so it can help you adapt).
- [`../docs/API.md`](../docs/API.md) – the backend contract.
- [`architecture.md`](architecture.md) – folder structure, state ownership, conventions.
- [`design-brief.md`](design-brief.md) – what the finished app looks and feels like.
