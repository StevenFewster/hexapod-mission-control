# Chapter 1 – Components & JSX

> **Goal:** build the first real pieces of UI (status badge, battery meter, robot card, fleet
> grid) and set up the visual foundation everything else is built on.
> **Time:** 5–6 hours · **New libraries:** Tailwind CSS v4, clsx, tailwind-merge, lucide-react,
> Fontsource

## What you'll build

A `/` page showing a responsive grid of robot cards from sample data: callsign, model, a status
badge with icon, a segmented battery meter, location summary, and a fault message where
relevant. It looks like the fleet overview in [`design-brief.md`](../design-brief.md), static for now.

## Angular bridge

| Angular | React |
|---|---|
| `input()` / `@Input()` | props (function parameters) |
| `output()` | callback props `onSomething` |
| `<ng-content>` | `children` |
| `@for (r of robots; track r.id)` | `robots.map(r => <RobotCard key={r.id} robot={r} />)` |
| `@if` / `@else` | `&&`, ternaries, or an early `return` |
| `[ngClass]` | `className={cn(...)}` |
| pipes | plain functions (`formatPercent(r.battery)`) |
| component stylesheet | utility classes in the markup |

**Where it breaks down:** a component is a function React may call many times. There's no
instance to stash things on, and no lifecycle between calls. Props are read-only snapshots:
**never mutate them**.

---

## 1.1 Tailwind v4 and design tokens

```sh
npm i tailwindcss @tailwindcss/vite
npm i -D prettier-plugin-tailwindcss
```

- Add `tailwindcss()` to the Vite plugins and replace `src/index.css` with `@import "tailwindcss";`.
- Add `"plugins": ["prettier-plugin-tailwindcss"]` to `.prettierrc`. It sorts class names, which
  keeps diffs clean.

**Design tokens.** From the colour table in the design brief, define CSS variables on `:root`
(dark, the default) and `.light` (light theme), then expose them to Tailwind with `@theme inline`
so you get utilities like `bg-surface`, `text-muted`, `border-border`, `text-live`:

```css
@import "tailwindcss";

:root {
  --bg: oklch(0.16 0.015 250);
  --surface: oklch(0.2 0.015 250);
  /* …the rest from the brief… */
}
.light {
  --bg: oklch(0.985 0.003 250);
  /* … */
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  /* … */
  --font-sans: "IBM Plex Sans Variable", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
}

body { @apply bg-bg text-text font-sans antialiased; }
```

Fonts: install them from [Fontsource](https://fontsource.org) (check the exact package names
there, e.g. a variable IBM Plex Sans and IBM Plex Mono) and import them in `main.tsx`.

**Learn:** Tailwind v4 is configured **in CSS** (`@theme`), and there's no `tailwind.config.js`
by default. `inline` makes the utilities reference your variables, so switching a class on
`<html>` re-themes everything with no rebuild. Chapter 3 plugs shadcn/ui into these same tokens.

**Check:** `<h1 className="text-live font-mono">` renders in your cyan, in Plex Mono.

## 1.2 `cn()` and the first component: `StatusBadge`

```sh
npm i clsx tailwind-merge lucide-react
```

Create `src/lib/cn.ts`:

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
```

`clsx` handles conditionals (`active && 'ring-2'`). `twMerge` resolves conflicts so a caller's
`className="px-4"` beats your default `px-2`.

**Temporary types.** Until chapter 5 introduces Zod, write minimal types in
`src/features/fleet/types.ts` for `Robot` and `RobotStatus`. Copy the shapes from `docs/API.md`
(don't import from `src/mocks`).

Now `src/features/fleet/components/status-badge.tsx`:

- Props: `status: RobotStatus`, plus every normal `<span>` prop. Type it as
  `ComponentProps<'span'> & { status: RobotStatus }` and spread the rest onto the span, so callers
  can pass `className`, `title`, `data-*`…
- A **lookup object** `Record<RobotStatus, { label, icon, tone }>` instead of a `switch`.
  TypeScript then forces you to handle every status. Add a status to the union and see the error.
- Icon from `lucide-react`, colour from the tone, and the label as visible text, so colour is
  never the only signal.

**Learn:** "props in, JSX out". Destructure props in the signature, give optional props defaults
there (`size = 'md'`), and spread `...rest` last.

## 1.3 `BatteryMeter`

A 10-segment meter plus a numeric percentage, coloured by thresholds (≤ 20 danger, ≤ 40
caution, else ok). Make it accessible: `role="meter"`, `aria-valuenow`, `aria-valuemin`,
`aria-valuemax`, `aria-label="Battery"`.

- Build the segments with `Array.from({ length: 10 }, (_, i) => …)`. That's a list, so
  each segment needs a `key`. Here the index *is* the identity, so `key={i}` is correct.
- Put formatting in `src/lib/format.ts` (`formatPercent`, later units and times) using
  `Intl.NumberFormat`. These are your pipes.
- Numbers use `tabular-nums` so they don't jitter when they go live in chapter 7.

## 1.4 `RobotCard`: composition and conditional rendering

Grab real data: in the browser console run `copy(await (await fetch('/api/robots')).json())`
and paste it into `src/features/fleet/sample-data.ts` (typed as `Robot[]`). This is temporary.

Build `RobotCard({ robot, actions })`:

- Header: callsign, model and serial in muted mono, `StatusBadge`.
- Body: `BatteryMeter`; a one-line activity summary (at base / on mission / last seen 4 min ago
  for offline); the `faultReason` **only when** status is `fault`.
- `actions?: ReactNode`, a **slot** where the parent can put buttons later. That's
  `<ng-content select="[actions]">` as a plain prop.
- Offline robots render dimmed.

Practise all three conditional styles and notice which reads best where:
`{robot.faultReason && <p>…</p>}`, `{x ? <A/> : <B/>}`, and an early `return` in a small
helper component.

> ⚠️ `{count && <Badge/>}` renders a literal **0** when count is 0. Use `count > 0 &&` or a
> ternary.

## 1.5 `FleetGrid` and thinking in components

- `FleetGrid({ robots })` maps to cards with `key={robot.id}`. Responsive grid:
  1 column → 2 → 3 → 4.
- An `EmptyState` component (icon, title, description, optional action slot) for when
  `robots.length === 0`. You'll reuse it everywhere.
- `App` renders a page header and `<FleetGrid robots={sampleRobots} />`.

**Learn: keys.** Temporarily key the cards by index, then reverse the array with a button. Put
a text input inside each card, type into the first one, then reverse. Watch the text stay in
position 1 while the robots move. With `key={robot.id}` it follows its robot. Keys are identity,
like `track` in `@for`, but getting them wrong breaks state, not just performance.

Read react.dev → *Thinking in React*, then sketch (paper is fine) the component tree for the
whole fleet page in the design brief. Keep it; you'll check it against reality in chapter 4.

## 1.6 Test it

Create `src/features/fleet/components/*.test.tsx`:

- `StatusBadge` renders the human label for each status (loop over the statuses).
- `BatteryMeter` exposes `aria-valuenow`, and shows the danger styling at 15%. Assert on
  something meaningful, like a `data-tone="danger"` attribute you add, rather than a class name.
- `FleetGrid` shows the empty state when given `[]`.

---

## Definition of done

- [ ] Fleet grid renders all six robots from sample data, responsive from phone to desktop
- [ ] Status is shown by icon + label + colour, never colour alone
- [ ] Battery meter is a proper `meter` with an accessible name
- [ ] No hard-coded colours in components, only token utilities
- [ ] Tests pass; lint and typecheck clean

## Polish pass

- Tabular numbers on every value; units in the muted tone with a thin space (`67 %`)
- Card hover and `focus-visible` styles (cards will become links in chapter 4)
- Toggle `class="light"` on `<html>` by hand: does the light theme look intentional too?
- Long callsigns truncate gracefully (try renaming one in sample data to something silly)

## Review questions

1. Why spread `...rest` onto the root element, and why does order matter relative to
   `className`?
2. What actually goes wrong with index keys when a list reorders?
3. Why a lookup object for status rather than a `switch` in JSX?
4. When does `{n && <X/>}` render something you didn't want?
5. Where does `twMerge` earn its place over plain `clsx`?

## Stretch

- A `Sparkline` stub component taking `number[]` that draws an SVG `<polyline>`. You'll feed it
  live data in chapter 8.
- Read about React's `children` type options (`ReactNode` vs `ReactElement`) and when to use each.
