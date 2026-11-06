# Chapter 9 – Operations map

> **Goal:** a live operations map that integrates a big imperative library cleanly: robots,
> trails, mission routes and survivor detections, plus a detections triage workflow.
> **Time:** 8–10 hours · **New libraries:** MapLibre GL JS, react-map-gl

## What you'll build

`/map`: a full-bleed dark map of the training ground. Heading-aware robot markers in status
colours, fading trails, active mission routes with numbered waypoints, and pulsing markers for
unconfirmed detections. Click a robot → side panel with vitals and commands; "follow" mode keeps
it centred. Layer toggles, fit-to-fleet, and the selected robot in the URL. Plus `/detections`, a
keyboard-driven triage inbox.

## Angular bridge

| Angular | React |
|---|---|
| Wrapping Leaflet/Mapbox in a component with `ViewChild` + `ngAfterViewInit` | react-map-gl's `<Map>` (it manages the instance) + `useMap()` / `mapRef` for imperative calls |
| `ngOnDestroy` → `map.remove()` | Handled by the wrapper; your own listeners clean up in effect cleanup |
| `ngOnChanges` → `map.flyTo()` | An effect that syncs **one** external thing with React state, carefully |

**Where it breaks down:** the map has its *own* state (camera position, zoom). Two sources of
truth (React state and the map) will fight unless you decide who owns what.

---

## 9.1 MapLibre with react-map-gl

```sh
npm i maplibre-gl react-map-gl
```

- Import from **`react-map-gl/maplibre`**, and import `maplibre-gl/dist/maplibre-gl.css`.
- Basemap: a free vector style. Options: CARTO **Dark Matter** / **Positron**
  (`https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`) or **OpenFreeMap**
  (`https://tiles.openfreemap.org/styles/…`). Check their terms and **keep the attribution
  visible**. Switch style with your theme.
- Centre on the base (`51.9925, -1.7135`, zoom ~16). The route component should be lazily loaded
  (it already is, thanks to route code splitting). Check maplibre isn't in your main bundle.
- `/map` is full-bleed inside the shell. Give the map container an explicit height.

## 9.2 Robot markers

- One `<Marker>` per robot, positioned from the **live store** (`latest[id].position`), falling
  back to the robot's REST position for offline robots.
- Marker content is your own component: a status-coloured chevron rotated by heading, with
  callsign label on hover/selection. Offline robots are hollow and dimmed.
- **Selection in the URL:** `/map?robot=rb_borealis`. Clicking a marker sets it; the side panel
  (`Sheet` on tablet, docked panel on desktop) reads it. Esc clears it.
- The side panel reuses components you already have: `StatusBadge`, gauges, command bar,
  current mission.

**Learn: markers vs layers.** `<Marker>` renders a DOM element per item. That's fine for 6 robots
and terrible for 6,000 points. For data-heavy things use **sources and layers** (rendered by
WebGL). You'll use both and should know when to use each.

## 9.3 Sources & layers

- **Trails:** a GeoJSON `FeatureCollection` of `LineString`s built from each robot's live
  history (last ~2 minutes). Derive it with `useMemo` from the store slice. A `line` layer with
  `line-gradient` or opacity fade, coloured per robot via data-driven styling.
- **Mission routes:** active (and selected) missions' waypoints → a dashed line plus `circle`
  and `symbol` layers for numbered waypoints; completed waypoints dimmed (use
  `currentWaypointIndex`).
- Layers read colours from your tokens. MapLibre can't read CSS variables, so resolve them once
  with `getComputedStyle` and recompute when the theme changes.

## 9.4 The imperative API: camera control

- `useMap()` (or a `mapRef`) for `flyTo`, `fitBounds`, `easeTo`.
- **Fit to fleet** button: bounds of all robot positions with padding.
- **Follow mode:** when a robot is selected and "follow" is on, keep it centred as it moves.
  Use `easeTo` with a short duration, throttled. Any user drag turns follow off. Detect it by
  checking `originalEvent` on `movestart`, so your own programmatic moves don't cancel themselves.
- Selecting a robot from elsewhere (`/map?robot=…` from a link or the command palette) flies to it.

Think about the loop: URL → effect → `flyTo` → `moveend` → … must **never** write back to the
URL. Write down who owns what: URL owns *selection*; the map owns *camera*; follow mode is UI
state.

## 9.5 Detections

- Query `GET /api/detections`; add a **clustered** GeoJSON source (`cluster: true`) with
  `circle` + count `symbol` layers. Unconfirmed detections pulse (a CSS animation on a
  `<Marker>` is fine for the few unconfirmed ones; confirmed and dismissed go in the layer).
- Live: a `detection` push invalidates the query, and the chapter 7 toast's "View" action now
  navigates to `/map?detection=dt_…`.
- `/detections` **triage inbox**: a list (newest unconfirmed first) + mini-map + detail with
  notes. **Keyboard:** `j`/`k` to move, `c` to confirm, `d` to dismiss, `n` to focus notes.
  Mutations are optimistic. This is where optimistic UI is right; explain why to yourself.
- Badge the nav item with the open-detections count (from `stats`).

## 9.6 Layer toggles & test it

- Layer toggles (trails, routes, detections, labels) live in the chapter 7 `ui-store`
  (persisted). Toggle with a small control panel bottom-left.
- WebGL maps don't run in jsdom. **Mock** `react-map-gl/maplibre` in component tests (a
  `vi.mock` that renders children and records props). Test:
  - selecting a robot from the list sets `?robot=` and opens the panel
  - triage keyboard flow: `j`, `c` → confirm mutation sent, item updates optimistically
  - building trail GeoJSON from frames (pure function)
- Real map behaviour gets a Playwright test in chapter 14.

---

## Definition of done

- [ ] Live map with heading markers, trails, mission routes, detections (clustered)
- [ ] URL owns selection; map owns camera; follow mode doesn't fight the user
- [ ] Side panel reuses existing components and commands
- [ ] Detections triage works entirely from the keyboard, optimistically
- [ ] Layer toggles persisted; theme switches basemap and layer colours
- [ ] Map library lazy-loaded; attribution visible

## Polish pass

- Markers don't jump: smooth position transitions between 2 Hz updates (CSS transition on the
  marker, or interpolate)
- Scale bar and compass control; sensible min/max zoom; bounds limited to the operating area
- Tablet: panel is a bottom sheet; map controls are thumb-reachable
- Loading the map shows a skeleton of the same size (no layout shift)

## Review questions

1. When would you use a `<Marker>` vs a layer?
2. Who owns the camera, and how did you prevent URL ↔ map feedback loops?
3. Why can't map layers use CSS variables directly, and how did you handle themes?
4. Why is optimistic UI right for triage but wrong for robot commands?
5. How did you tell user-initiated map movement from programmatic movement?

## Stretch

- A heatmap layer of all historical detections.
- Draw the 5 km operating boundary and grey out everything outside it.
- Measure: render 5,000 random points as markers vs a layer and record the FPS difference.
