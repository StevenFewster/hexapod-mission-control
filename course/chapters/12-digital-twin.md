# Chapter 12 – Digital twin

> **Goal:** a 3D model of the selected hexapod, animated from live joint telemetry at 60 fps,
> built declaratively and kept fast by moving per-frame work outside React's render cycle.
> **Time:** 8–10 hours · **New libraries:** three, React Three Fiber, drei

## What you'll build

`/fleet/$robotId/twin`: a procedurally built hexapod (no model files) standing on a ground
grid. Its six legs move with the robot's real gait. The body rolls and pitches with the IMU and
turns with its heading. Leg motors glow from cool to hot with temperature. Click a leg for its
live stats. It idles calmly when the robot stops, kneels when charging or faulted, and goes
dark when offline.

## Angular bridge

There's no real Angular equivalent. Most Angular 3D work drives three.js imperatively from a
component. React Three Fiber (R3F) lets you **describe the scene graph in JSX**:
`<mesh position={[0, 1, 0]}><boxGeometry /><meshStandardMaterial /></mesh>` creates and
manages the three.js objects for you.

**Where it breaks down:** React re-rendering at 60 fps would be far too slow. R3F's answer is
`useFrame`: a per-frame callback where you **mutate three.js objects through refs**, outside
React's render. React builds the scene; the frame loop animates it. Knowing which job belongs to
which is the lesson of this chapter.

---

## 12.1 First scene

```sh
npm i three @react-three/fiber @react-three/drei
npm i -D @types/three
```

- `<Canvas camera={{ position: [3, 2.5, 3], fov: 45 }} shadows>` with ambient and directional
  lights, a ground plane that receives shadows, and drei's `<OrbitControls>` and `<Grid>`.
- A spinning box using `useFrame((_, delta) => ref.current.rotation.y += delta)`. Note that
  nothing re-renders, yet it animates.
- Lazy-load the twin route (it already is) and wrap the canvas in `<Suspense>` with a skeleton
  the same size.

## 12.2 Build the hexapod procedurally

Components mirror the robot's structure:

```
<Hexapod>
  <Body />                      hexagonal chassis (extruded shape or cylinder with 6 segments)
  {LEGS.map(leg => <Leg key={leg.id} mount={leg.mount} side={leg.side} />)}
</Hexapod>

<Leg>   group at mount point, rotated to face outward
  <group ref={coxaRef}>        rotates around Y (hip yaw)
    <mesh /> coxa segment
    <group ref={femurRef}>     rotates around Z/X (upper leg pitch)
      <mesh /> femur
      <group ref={tibiaRef}>   lower leg pitch
        <mesh /> tibia + foot
```

- Pivot points are the whole trick: each `group` sits at the joint, and the mesh is offset
  so it rotates around its end. Get one leg right, then place six.
- Mount points: three per side (front, middle, rear), mirrored. Right-side legs mirror the
  coxa rotation sign.
- Materials use your palette (resolve CSS variables as in chapter 9). Body is matte slate,
  joints get small accent rings.
- Scale differs by model: Heavy is larger and squatter than Scout.

## 12.3 Drive it from telemetry, the right way

The wrong way: `const frame = useLiveStore(s => s.latest[id])` in `<Hexapod>` and passing
angles as props. That re-renders the tree at 2 Hz, and it would still look choppy.

The right way:

- Read the store **inside `useFrame`** without subscribing: `useLiveStore.getState().latest[id]`.
- Set `coxaRef.current.rotation.y = …` directly. No state, no props, no re-render.
- Convert degrees to radians once. Map telemetry angle conventions (`docs/API.md`: coxa
  positive = forward) to your model's axes. Expect to flip a sign or two.

Prove it: the React Profiler shows **zero** commits while the twin animates.

## 12.4 Smooth motion between frames

Telemetry arrives at 2 Hz; the screen runs at 60 Hz. Two techniques, and do both:

1. **Damping** for slow-changing values (body roll and pitch, heading, temperatures): ease the
   current value toward the target each frame (`THREE.MathUtils.damp`, or drei/maath helpers).
2. **Extrapolation** for the gait: frames include `gaitPhase` (0–1) and `stepHz`. Each frame,
   compute `phase = frame.gaitPhase + frame.stepHz * secondsSince(frame.ts)`, then compute the
   joint angles **yourself** from the phase. Port the gait formula (swing and stance per leg,
   with per-gait offsets and duty factors: tripod, ripple, wave) into
   `features/twin/kinematics.ts` as pure functions. Read `src/mocks/world.ts` for the reference
   implementation, but **write your own** in the app.

Compare the two approaches visually for the legs: damped joint angles look floaty, while
phase-driven legs look like walking. Body height dips when `charging`/`fault` (kneeling), and
everything freezes and desaturates when offline.

## 12.5 Data overlays & interaction

- **Temperature colour:** lerp each leg's motor ring from cool (`--live`) through `--caution`
  to `--danger` across 30–85 °C, updated in `useFrame` on the material colour.
- **Load:** foot contact indicator (a small disc under each foot that lights when `contact`).
- **Click a leg** → select it (this one *is* React state: it changes rarely) → drei `<Html>`
  label anchored to the leg showing live temperature, load and angles. Hover changes the cursor
  and outlines the leg.
- A small HUD in normal DOM over the canvas: callsign, gait, speed, "following live" indicator.

## 12.6 Performance & resilience, then test it

- `frameloop="demand"` when the robot is idle or offline, and `invalidate()` on changes. Back to
  `"always"` while moving. Measure GPU and CPU in DevTools with each setting.
- Cap `dpr={[1, 2]}`; reuse geometries and materials across legs (create once with `useMemo`,
  share); let R3F dispose on unmount.
- **No WebGL?** Wrap the canvas in an error boundary with a friendly fallback (a 2D SVG top-down
  leg diagram is a nice touch).
- Check the route chunk: three.js must not be in the main bundle.
- Tests: R3F needs WebGL, so unit-test what matters. `kinematics.ts` gets thorough tests (tripod:
  legs 0/2/4 are in swing when 1/3/5 are in stance; duty factor respected; angles within limits).
  Colour interpolation is a pure function. The visual check comes in chapter 14 (Playwright
  screenshot).

---

## Definition of done

- [ ] Procedural hexapod with correct joint pivots; Scout and Heavy look different
- [ ] Driven from telemetry inside `useFrame`; zero React commits while animating
- [ ] Gait extrapolated from phase; body damped; states (kneel, offline) handled
- [ ] Leg temperature colours, contact indicators, clickable legs with live labels
- [ ] Demand frameloop when idle; WebGL fallback; three.js lazy-loaded
- [ ] Kinematics unit-tested

## Polish pass

- Soft contact shadows and a subtle environment light; no harsh default look
- Camera starts at a flattering three-quarter angle and resets with a button
- Labels use your fonts and tokens and stay legible over the scene
- Works in both themes (light theme gets a light ground)

## Review questions

1. Why read the store inside `useFrame` rather than subscribing with a selector?
2. Damping vs extrapolation: when is each appropriate?
3. Which pieces of twin state belong in React state, and which never should?
4. How does `frameloop="demand"` save power, and what must you remember to do?
5. Why are pivot groups the key to the leg model?

## Stretch

- Ghost mode: overlay the last 2 seconds of leg poses as transparent copies.
- Show the planned path ahead of the robot on the ground plane.
- Replace the procedural body with a modelled GLB (Blender) loaded via drei's `useGLTF`, keeping
  the procedural legs.
