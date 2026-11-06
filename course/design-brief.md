# Design brief

What the finished app should look and feel like. Use it in every chapter's polish pass.

## The product in one paragraph

**Hexapod Mission Control** is the console a search-and-rescue team uses to run a fleet of
six-legged robots on a disaster site. Operators watch robots move on a live map, read their
vital signs, send commands, plan routes through rubble, and triage "possible survivor"
detections. It's used for hours at a time, often under stress, sometimes on a tablet in a
van. **Calm, dense, legible, fast.** Nothing decorative that doesn't carry information.

## Aesthetic direction: "quiet instrument panel"

Think aircraft glass cockpit or a well-made trading terminal, not a gaming HUD. Avoid
neon-on-black sci-fi clichés, gradients and glassmorphism.

- **Dark by default**, with a proper light theme for daylight field use (chapter 3).
- **Colour is information.** The UI is mostly neutral slate; colour appears only for status,
  live data and alerts, so when something turns amber, you notice.
- **Numbers are first-class.** Telemetry uses a monospaced face with tabular figures so values
  don't jitter as they update. Units are always shown, in a muted tone (`48.2 °C`).
- **Density with breathing room.** A 4 px base grid, compact controls (32–36 px tall), generous
  spacing *between* groups rather than inside them.
- **Motion is functional.** Things move to show cause and effect (a card expanding into its
  detail page, a new alert sliding in), never just to decorate. Respect `prefers-reduced-motion`.

### Type

- UI: **IBM Plex Sans**. Telemetry and IDs: **IBM Plex Mono**. Both free, via Fontsource
  (self-hosted, no layout shift from a font CDN). Alternatives with the same feel: Geist +
  Geist Mono, or Inter + JetBrains Mono.
- Scale: 12 / 13 / 14 (body) / 16 / 20 / 24 / 32. Labels in small caps or uppercase 11–12 px
  with letter spacing for instrument-style captions.
- `font-variant-numeric: tabular-nums` on anything that updates live.

### Colour tokens (starting point; tune them)

Defined as CSS variables in OKLCH and exposed to Tailwind via `@theme` (chapter 1), then shared
with shadcn/ui's variables (chapter 3).

| Token | Dark | Light | Used for |
|---|---|---|---|
| `--bg` | `oklch(0.16 0.015 250)` | `oklch(0.985 0.003 250)` | page |
| `--surface` | `oklch(0.20 0.015 250)` | `oklch(1 0 0)` | cards, panels |
| `--surface-raised` | `oklch(0.24 0.015 250)` | `oklch(0.97 0.004 250)` | popovers, hover |
| `--border` | `oklch(0.30 0.015 250)` | `oklch(0.90 0.005 250)` | hairlines |
| `--text` | `oklch(0.94 0.005 250)` | `oklch(0.22 0.015 250)` | primary text |
| `--text-muted` | `oklch(0.68 0.015 250)` | `oklch(0.50 0.015 250)` | labels, units |
| `--live` | `oklch(0.80 0.12 210)` | `oklch(0.55 0.12 220)` | live data, focus, primary actions |
| `--ok` | `oklch(0.78 0.15 150)` | `oklch(0.55 0.14 150)` | healthy, confirmed |
| `--caution` | `oklch(0.82 0.15 80)` | `oklch(0.62 0.15 70)` | warnings, holding |
| `--danger` | `oklch(0.68 0.20 25)` | `oklch(0.55 0.20 25)` | errors, faults, critical |
| `--idle` | `oklch(0.70 0.02 250)` | `oklch(0.55 0.02 250)` | idle, offline (with a pattern or icon, not colour alone) |

**Robot status → colour + icon** (never colour alone):
`idle` idle/●, `on-mission` live/▶, `holding` caution/⏸, `returning` live/⌂, `charging` ok/⚡,
`fault` danger/⚠, `offline` idle, dimmed, with a strike-through signal icon.

Check text contrast ≥ 4.5:1 (body) and ≥ 3:1 (large text, UI glyphs) in **both** themes.

## Layout

```
┌────┬──────────────────────────────────────────────────────────────────────┐
│    │ ● LIVE  14:32:07 UTC   6 robots  2 active missions   ⚠ 3 alerts   👤 │  ← status strip
│ ⌂  ├──────────────────────────────────────────────────────────────────────┤
│ ⛶  │                                                                      │
│ ✈  │                         page content                                 │
│ ☰  │                                                                      │
│ ⚙  │                                                                      │
└────┴──────────────────────────────────────────────────────────────────────┘
 nav rail (icons + tooltips; expands on wide screens)
```

- **Status strip** is always visible: connection state, UTC clock, fleet counts, unacknowledged
  alerts (clicking opens the log filtered to them), user menu.
- **⌘K / Ctrl-K** opens the command palette anywhere (chapter 13).
- Breakpoints: ≥ 1280 full layout · 768–1279 nav rail collapses, side panels become sheets ·
  < 768 bottom tab bar, single column. The map and twin must work on a tablet.

## Screens

### Fleet overview `/fleet`
```
 Fleet                                    [search…] [status ▾] [sort ▾] [grid|list]
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ ATLAS  Heavy  │ │ BOREALIS Scout│ │ ECHO   Scout  │
│ ● idle        │ │ ▶ on mission  │ │ ⚠ fault       │
│ ▮▮▮▮▮▮▮▮▯ 91% │ │ ▮▮▮▮▮▮▯▯▯ 67% │ │ LM motor over-│
│ ⌂ at base     │ │ wp 3/8  ↗ 1.4 │ │ temperature   │
│               │ │ ~~sparkline~~ │ │ [Clear fault] │
└───────────────┘ └───────────────┘ └───────────────┘
```
Cards update live (battery, speed, sparkline). Filters live in the URL.

### Robot detail `/fleet/$robotId`
Header: callsign (editable inline), model, serial, status, battery, signal, quick command
buttons. Tabs: **Overview** (vitals, current mission, recent events) · **Telemetry** (charts) ·
**Twin** (3D) · **Log**.

### Operations map `/map`
Full-bleed dark map. Robots as heading-aware markers with short trails; waypoints of active
missions; detections as pulsing markers. Right-hand panel (sheet on tablet): selected robot or
detection, with actions. Layer toggles bottom-left.

### Missions `/missions`, planner `/missions/new`, `/missions/$id`
List grouped by status with progress bars. Planner is a three-step wizard (Details → Route →
Review). On the Route step the map and the waypoint list sit side by side: click the map to add,
drag in the list to reorder, and the route redraws live.

### Event log `/events`
Dense virtualised table: time, level, robot, source, code, message, ack. Faceted filters, text
search, saved in the URL. New events slide in at the top with a "N new events" pill if you've
scrolled. Multi-select and bulk acknowledge.

### Detections `/detections`
Triage inbox: list + mini-map + confirm/dismiss with notes. Keyboard-driven (j/k, c, d).

### Login `/login`
One calm screen with the demo accounts listed, because this is a public demo.

## What "polished" means here

Use this as a checklist in every chapter's polish pass.

**States.** Every async view has a designed loading state (skeletons shaped like the content, not
spinners), an empty state (what this is, plus the next action), an error state (what happened,
plus a retry), and a stale/reconnecting state for live data.

**Feedback.** Every action acknowledges itself within 100 ms (pressed state, optimistic update or
pending indicator). Async commands show pending → accepted/rejected. Destructive actions confirm
or offer undo.

**Keyboard & a11y.** Visible focus everywhere. Logical tab order. Dialogs trap and restore focus.
Every icon button has an accessible name. Live regions announce critical alerts. No information
conveyed by colour alone.

**Details.** Tabular numbers. Units everywhere. Relative times ("2 min ago") with the absolute
time in a tooltip. Times in UTC with a toggle. No layout shift when data arrives. Truncation with
tooltips, not overflow. Sensible document titles per page (`Borealis · Fleet · HMC`).

**Performance.** Nothing janks while telemetry streams. Initial JS for the first route is small;
map, charts and 3D load on demand.

## Portfolio deliverables (chapter 15)

- A README with a hero GIF (map with robots moving and an alert arriving), a feature list, the
  stack, an architecture diagram and "run it locally" in three commands.
- A live demo URL with the demo accounts on the login page.
- A short case study: the problem, three interesting technical decisions (live data pipeline,
  state ownership, 3D twin performance), what you'd do next.
