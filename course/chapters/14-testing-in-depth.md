# Chapter 14 – Testing in depth

> **Goal:** a test suite you'd be proud to show: a deliberate strategy, fast and reliable
> integration tests, end-to-end tests of the critical journeys, visual regression, and a
> component catalogue.
> **Time:** 8–10 hours · **New libraries:** Playwright, Storybook (+ MSW addon)

## What you'll build

- A written testing strategy (`docs/testing.md`) mapping each kind of risk to a layer.
- A shared test harness, audited for flakiness.
- Playwright E2E: sign in → plan a mission on the map → start it → watch it go active; observer
  restrictions; fault recovery; reconnection.
- Screenshot tests of key screens with a frozen, deterministic simulator.
- Storybook with every UI and feature component in all its states, interaction tests and a11y
  checks, published as a portfolio artefact.

## Angular bridge

| Angular | Here |
|---|---|
| TestBed + component harnesses | Testing Library + `renderWithProviders` + role-based queries |
| `HttpTestingController` | MSW: the **same handlers** as dev, overridden per test |
| `fakeAsync` / `tick` | `vi.useFakeTimers()` / `advanceTimersByTime`, plus `backend.world.advance(ms)` |
| Cypress | Playwright |
| Storybook for Angular | Storybook for React (same tool, more common in React shops) |

---

## 14.1 Strategy and harness

Write `docs/testing.md` (one page):

- **Unit (pure functions):** kinematics, estimates, filters, formatters, merges. Many, fast.
- **Integration (components + providers + MSW):** most of your confidence. One test per user
  behaviour, not per component.
- **E2E (Playwright):** 5–8 critical journeys in a real browser with the real simulator.
- **Visual:** a handful of key screens.
- **What you don't test:** library internals, styles, implementation details.

Harness audit:
- `renderWithProviders(ui, { route, user, simConfig })`: fresh QueryClient, memory router,
  optional signed-in user, and live connection wiring. Returns `user` (userEvent) and helpers.
- Stores reset between tests (Zustand stores need an explicit reset).
- `onUnhandledRequest: 'error'` stays on. Unmocked requests are bugs.
- Run the suite 10 times (`for i in $(seq 10); do npx vitest run || break; done`) and fix every flaky test. Typical
  causes: missing `await` on `findBy`, shared state, real timers.

## 14.2 Integration tests that read like stories

Fill the gaps from earlier chapters, organised by **feature**, not by component:

- *Fleet*: filters via URL, live battery updates (`backend.world.advance(2000)` → value
  changes), command flow including rejection reasons
- *Missions*: create → appears in list as draft; start → becomes active on push
- *Events*: live insertion and bulk acknowledge
- *Auth*: guard, redirect-back, expiry
- *Resilience*: with `errorRate` overridden for a single test, the page degrades to the
  compact error states

Use `within()` to scope queries to regions (`within(screen.getByRole('region', { name: /fleet/i }))`),
and give your landmarks accessible names so this works.

## 14.3 Hooks, stores and the connection

- `renderHook` for `useTelemetrySeries`, `useRobotCommand`, `useConnectionState`
- `LiveConnection` with fake timers: backoff sequence, ping/pong latency, no reconnect after
  4401, resubscribe after reconnect
- Store tests: call actions directly, assert state; selectors stable

## 14.4 Playwright E2E

```sh
npm init playwright@latest
```

- `playwright.config.ts`: `webServer` runs `npm run build && npm run preview` (test the
  production build), with projects for Chromium and WebKit plus one mobile viewport.
- **Deterministic simulator:** set `localStorage['hmc:sim']` via an `addInitScript`
  (`{ latency: [0, 50], timeScale: 10, faultRatePerMinute: 0 }`) so journeys run fast.
- **Auth state reuse:** a setup project signs in once per role and saves `storageState`.
- Journeys:
  1. Operator: sign in → `/missions/new` → fill details → click 3 points on the map → reorder
     with the keyboard → save & start → mission detail shows "active" and progress advances
  2. Observer: command buttons disabled with explanation; direct API attempt shows the 403 toast
  3. Fault recovery: `page.evaluate(() => __sim.world.trigger('fault', 'rb_atlas'))` → alert
     announced → wait for cool-down (`timeScale` helps) → clear fault → idle
  4. Reconnect: trigger `disconnect` → strip shows reconnecting → recovers
  5. Event log: filter to critical, acknowledge all, alert badge goes to zero
- Use role-based locators (`getByRole`) and web-first assertions (`await expect(...).toBeVisible()`).
  No `waitForTimeout`.
- Run with `--trace on-first-retry` and learn the trace viewer. It's excellent.

## 14.5 Visual regression

- `await expect(page).toHaveScreenshot()` for: fleet grid, robot telemetry, map (masked or
  with a fixed camera), event log, mission review step, login, in both themes.
- **Freeze time:** Playwright's `page.clock` to fix `Date.now`, and simulator `timeScale: 0` or
  `tickMs` large, so robots don't move between runs. Mask the clock and anything still live with
  `mask: [locator]`.
- Screenshots are OS-dependent. Generate the baseline in the same environment CI uses (chapter 15
  runs them in Linux; use the Playwright Docker image locally or update baselines from CI).

## 14.6 Storybook

```sh
npm create storybook@latest
```

- Stories for: every `components/ui` customisation, `StatusBadge` (all statuses), `BatteryMeter`
  (thresholds), gauges, `RobotCard` (every status and edge case: long callsign, offline, fault),
  `EmptyState`/`ErrorState`, the waypoint row, the event table (loading / empty / error / many rows).
- **Data:** `msw-storybook-addon` with handlers per story (reuse the simulator, or tiny overrides
  for edge cases); decorators for QueryClient, router and theme.
- **Interaction tests** with `play` functions (e.g. the inline rename flow). **a11y addon** on.
  Run them in CI with Storybook's test runner (or its Vitest integration).
- Theme toolbar switch (dark/light).

Storybook is also documentation: a visitor can browse your design system without signing in.

## 14.7 Coverage and scripts

- `vitest run --coverage` (v8). Look at what's **uncovered** and decide whether it matters.
  Don't chase a number. A sensible floor (e.g. 70% lines on `features/` and `lib/`) in config
  catches accidents.
- Scripts: `test`, `test:run`, `test:coverage`, `e2e`, `e2e:ui`, `storybook`, `build-storybook`,
  and a `verify` script that runs lint + typecheck + unit + build (chapter 15's CI calls it).

---

## Definition of done

- [ ] `docs/testing.md` written; suite organised by feature
- [ ] Suite passes 10 runs in a row
- [ ] 5 Playwright journeys passing on Chromium and WebKit against the production build
- [ ] Visual baselines for key screens in both themes, deterministic
- [ ] Storybook with states, MSW data, interaction tests and a11y checks
- [ ] Coverage report reviewed; floor set

## Review questions

1. Where does most of your confidence come from, and why there?
2. What made tests flaky, and how did you fix each cause?
3. Why test E2E against `preview` rather than `dev`?
4. How did you make screenshots deterministic with a live simulator?
5. What's in Storybook that isn't covered by any test, and is that OK?

## Stretch

- Mutation testing with Stryker on `features/missions` to see whether your tests catch bugs.
- Contract test: a script that validates the simulator's responses against your app's Zod schemas
  for every endpoint, so drift between "backend" and frontend is caught automatically.
