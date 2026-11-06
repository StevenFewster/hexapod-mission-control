# Chapter 8 – Telemetry charts

> **Goal:** a telemetry tab with live charts and hand-built SVG instruments that update smoothly,
> plus an understanding of React rendering performance you can explain in an interview.
> **Time:** 6–8 hours · **New libraries:** Recharts, React Compiler (babel plugin)

## What you'll build

On `/fleet/$robotId/telemetry`: battery and current over time; six leg-motor temperatures with a
70 °C warning line; IMU roll and pitch; signal strength. A time-window selector (1 / 5 / 10 min)
and hover tooltips synced across charts. In the header: a radial battery gauge, a heading
compass and signal bars, all your own SVG. Fleet cards get a battery sparkline.

## Angular bridge

| Angular | React |
|---|---|
| ngx-charts / ng2-charts wrappers | Recharts: charts *are* components (`<LineChart><Line dataKey="…"/></LineChart>`) |
| `ChangeDetectionStrategy.OnPush` | `memo()`, and now the **React Compiler** doing it for you |
| `trackBy` to avoid DOM churn | stable keys + stable data references |
| Angular DevTools profiler | React DevTools **Profiler** |

---

## 8.1 Recharts basics

```sh
npm i recharts
```

- A `BatteryChart` for one robot: `ResponsiveContainer` → `LineChart` → `XAxis` (time),
  `YAxis` (0–100), `Tooltip`, `Line`. Data from `GET /api/robots/:id/telemetry?minutes=5` via a
  query.
- **Theme it:** charts read colours from your CSS variables (`stroke="var(--live)"`); grid lines
  use `--border`, ticks `--text-muted` in the mono font. They must look right in both themes.
- Format the time axis (`HH:mm:ss`, UTC or local per your ui-store preference) with a shared
  formatter from `lib/format.ts`.

## 8.2 History + live, merged

`useTelemetrySeries(robotId, { minutes, pick })`:

1. **History** from the REST query (fetched once per robot/window).
2. **Live** frames from `useLiveStore` (`history[robotId]`).
3. Merge: concatenate, de-duplicate by `ts`, trim to the window, and `pick` only the fields the
   chart needs (`f => ({ ts: f.ts, battery: f.battery.percent })`). Smaller objects mean cheaper
   renders.

Write the merge as a **pure function** in its own file, with unit tests, and keep the hook thin.
Turn off chart animation for live series (`isAnimationActive={false}`), or every update replays
an animation.

## 8.3 Multi-series and small multiples

- **Leg temperatures:** six lines (LF…RR), a `ReferenceLine` at 70 °C (caution) and 85 °C
  (danger), and a legend that toggles series on click (local state).
- **IMU:** roll and pitch on a shared axis, symmetrical domain.
- **Current & battery:** two Y axes.
- `syncId` on all charts so hovering one shows the cursor on all of them.
- Window selector (1 / 5 / 10 min) **in the URL** (`?window=5`). You know why by now.

Try it with Draco while it lifts (payload raises motor temperatures) and with Echo cooling down
after its fault.

## 8.4 Custom SVG instruments

No library; this is where you learn SVG in JSX.

- **`RadialGauge`**: an arc from `-135°` to `+135°` with the value arc on top, value text in the
  centre, threshold colours. Do the maths for `stroke-dasharray` or arc paths yourself.
- **`Compass`**: a rotating needle (`transform={`rotate(${heading} 50 50)`}`), N/E/S/W ticks.
  Use a CSS `transition` on the transform so it eases between 2 Hz updates, and handle the
  359° → 1° wrap so it doesn't spin the long way round.
- **`SignalBars`**: four bars from `signal` (0–100).
- All three take plain props and know nothing about robots or stores. Wrap them in tiny
  connected components that read the live store.
- Give each an accessible name and value (`role="img"` + `aria-label="Heading 214°"`, or `meter`).

## 8.5 Rendering performance

Measure first. Open the React DevTools **Profiler**, record 10 seconds on the telemetry tab, and
find:
- which components render on every telemetry frame, and how long each takes
- anything rendering that shouldn't (the page header? the tabs?)

Then improve, measuring after each step:

1. **Push state down / select less:** the commonest fix. Components that don't show live values
   shouldn't subscribe to them.
2. **React Compiler:** follow react.dev → *React Compiler* → installation for Vite
   (`babel-plugin-react-compiler` via the React plugin's `babel` option) and enable the
   compiler-related lint rules. It auto-memoises components and values. Profile again. What
   changed? Read one compiled component in the Sources panel.
3. **`useDeferredValue`** for the heaviest chart: React renders it at lower priority, so the
   gauges stay smooth.
4. **Throttle** chart updates to 1 Hz while the gauges stay at 2 Hz. Charts don't need more.

Write the before/after numbers (commits/sec, render ms) in your PR description or in
`docs/decisions.md`. Interviewers love this.

**Learn:** `memo`, `useMemo` and `useCallback` still exist and are worth understanding (the
compiler essentially writes them for you). Manual memoisation without measurement is noise.
The compiler is not magic: it bails out on code that breaks the Rules of React (mutating
props, reading refs during render), which is another reason to keep components pure.

## 8.6 Sparklines & test it

- Feed the chapter 1 `Sparkline` stub with the last 2 minutes of battery from the live store on
  every fleet card. Six cards × 2 Hz: check the Profiler again.
- Tests:
  - `mergeSeries`: dedupes by `ts`, trims to the window, keeps order (pure unit tests)
  - `RadialGauge` exposes the right accessible value; `Compass` takes the shortest rotation path
    (test the angle maths as a pure function)
  - The telemetry tab renders charts for a robot (mock `ResizeObserver` in jsdom, or give
    `ResponsiveContainer` fixed dimensions in tests)

---

## Definition of done

- [ ] Telemetry tab with four chart groups, synced tooltips, URL-driven window
- [ ] History and live data merged without gaps or duplicates
- [ ] Three custom SVG instruments, accessible and theme-aware
- [ ] React Compiler enabled; profiling before/after written down
- [ ] Sparklines on fleet cards
- [ ] Pure logic is unit-tested

## Polish pass

- Charts have empty states (offline robot: "No telemetry for Fenix in the last 5 min")
- Gaps in data (robot went offline) show as gaps, not straight lines across
- Tooltips show units and full timestamps; axes don't overlap labels on narrow screens
- Gauges and charts agree on threshold colours

## Review questions

1. What made components re-render unnecessarily before you optimised?
2. What does the React Compiler do, and when does it bail out?
3. What's the difference between `useDeferredValue` and throttling?
4. Why keep the merge logic out of the hook?
5. How did you make the compass rotate the short way round?

## Stretch

- Try **uPlot** or **visx** for the leg temperature chart and compare performance and API feel
  with Recharts.
- A "flight recorder" scrubber: pause live updates and scrub back through the last 10 minutes.
