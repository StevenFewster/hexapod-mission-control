# Chapter 13 – Motion, polish & accessibility

> **Goal:** the pass that turns a working app into a polished product: purposeful animation,
> a command palette, a chaos panel for demos, and a real accessibility audit.
> **Time:** 8–10 hours · **New libraries:** Motion (formerly Framer Motion), cmdk

## What you'll build

- Fleet cards that glide into new positions when filters or sort change; panels and sheets that
  enter and leave gracefully; new log rows and alerts that draw the eye once.
- Shared-element transitions from a fleet card into the robot page.
- **⌘K / Ctrl-K command palette:** jump to any robot, mission or page; send commands; toggle
  theme and units.
- A **Chaos panel** (simulator controls) so anyone viewing your demo can break things and watch
  the app cope. It's a great portfolio talking point.
- An accessibility audit with every finding fixed.

## Angular bridge

| Angular | React |
|---|---|
| `@angular/animations` triggers, `:enter` / `:leave` | Motion `initial` / `animate` / `exit` + `<AnimatePresence>` |
| Route animations | `AnimatePresence` around the outlet, or the View Transitions API |
| `query()` + `stagger()` | `variants` with `staggerChildren` |
| CDK `LiveAnnouncer` | an `aria-live` region component |
| CDK `FocusMonitor` / `cdkTrapFocus` | Radix handles dialogs; you handle route-change focus |

---

## 13.1 Motion basics and principles

```sh
npm i motion
```

Import from `motion/react`. Start with three rules, and write them in `docs/decisions.md`:
1. Motion explains change (where did that come from, where did it go?). If it doesn't explain
   anything, delete it.
2. Fast: 150–250 ms for UI, springs for spatial movement.
3. `prefers-reduced-motion` turns movement into fades or nothing:
   `<MotionConfig reducedMotion="user">` at the root.

Exercises: animate the side panel on the map (`AnimatePresence` + `exit`), the status-strip
alert count bumping when it changes (`key` change triggers a fresh animation), and the
connection indicator's transitions.

## 13.2 Layout animations & shared elements

- **Fleet grid:** `motion.div layout` on each card + `<AnimatePresence mode="popLayout">`, so
  filtering and sorting animate positions. Check that live updates (battery at 2 Hz) *don't*
  trigger layout animations; only reorders should.
- **Waypoint list** in the planner: does `layout` play nicely with dnd-kit? (Hint: disable
  layout animation on the item being dragged.)
- **New log rows / alerts:** a one-time highlight fade on insert.
- **Card → robot page:** two options; try both, keep one, and say why:
  - Motion `layoutId` on the card's callsign and status, matching the robot header. Needs both
    elements present during the transition, which is tricky across routes.
  - The **View Transitions API**: `viewTransition: true` on the router `Link`/`navigate` (check
    TanStack Router docs) + matching `view-transition-name`s in CSS. Native, cheap, with
    progressive enhancement.

## 13.3 Command palette

`npx shadcn@latest add command` (built on cmdk).

- Global ⌘K / Ctrl-K (and `?` for a shortcuts help dialog) via your `useHotkey`.
- Groups: **Go to** (pages), **Robots** (each robot; typing "bor stop" offers "Stop Borealis"),
  **Missions** (by name), **Actions** (toggle theme, units, UTC/local, open chaos panel, sign out).
- Data from the Query cache (no extra requests). Commands reuse `useRobotCommand` and respect
  permissions (show disabled with a reason).
- Recent items at the top when empty; full keyboard support comes free from cmdk. Check focus
  returns to where it was when the palette closes.

## 13.4 The chaos panel

A `Sheet` (from the user menu, the palette, or `Shift+C`) that talks to `/api/sim/*`:

- Latency range slider, error-rate slider, time-scale slider (0.5×–10×), require-auth switch
- Buttons: trigger fault / low battery / detection / robot offline / drop connection; expire
  sessions; reset world
- Current config via a query; changes via mutations; reset invalidates **everything**
- A small banner when chaos settings are active ("Simulated 30% errors"), so demo viewers
  understand what they're seeing

Then go break your own app for 15 minutes. Make a list. Fix the list.

## 13.5 Polish sweep

Walk every screen against the "What polished means" checklist in
[`design-brief.md`](../design-brief.md). Typical findings:

- Skeletons that don't match the final layout (layout shift when data arrives)
- Missing empty states (a robot with no missions, a filter with no matches)
- Raw timestamps or numbers without units; inconsistent relative-time formats
- Document titles missing on some routes
- **Focus after navigation:** move focus to the page `<h1>` (with `tabIndex={-1}`) on route
  change, and add a "skip to content" link
- **Announcements:** an `aria-live="assertive"` region announces critical events ("Echo: motor
  over-temperature, motors disabled"); a polite one for command results
- **Tablet and phone:** map panel as a bottom sheet, tables become stacked cards, touch targets
  ≥ 44 px

## 13.6 Accessibility audit, then test it

1. **Automated:** axe DevTools on every page, both themes. Fix everything.
2. **Keyboard-only:** sign in, find Echo, clear its fault, plan a two-waypoint mission, start it,
   acknowledge an alert, all without a mouse. Note every place you got stuck.
3. **Screen reader:** VoiceOver (macOS: ⌘F5) or NVDA (Windows). Do the fleet page and the
   command palette. Are statuses, live values and buttons announced sensibly?
4. **Contrast:** check your tokens in both themes, especially muted text and status colours on
   surfaces.

Tests:
- axe checks (vitest-axe) on fleet, robot overview, missions list, events, login
- Palette: ⌘K opens, typing "atlas" → Enter navigates to Atlas, Esc restores focus
- Reduced motion: with `matchMedia('(prefers-reduced-motion: reduce)')` mocked to match,
  the panel appears without transform animation (assert via a `data-reduced-motion` flag or
  similar)
- Route change moves focus to the `<h1>`

---

## Definition of done

- [ ] Motion principles written down and followed; reduced motion respected everywhere
- [ ] Grid reorder and panel transitions animate; live data doesn't trigger layout animations
- [ ] Card → robot transition implemented (Motion or View Transitions), with the choice explained
- [ ] Command palette covers navigation, robots, missions and actions, with permissions
- [ ] Chaos panel complete, with a banner when active
- [ ] Polish sweep and accessibility audit done; findings fixed and listed in the PR

## Review questions

1. Why must live 2 Hz updates not trigger layout animations, and how did you prevent it?
2. Motion `layoutId` vs View Transitions: what did you choose and why?
3. What does `aria-live` assertive vs polite mean for your users?
4. Why move focus on route change in a SPA?
5. What was the most surprising thing the keyboard-only run revealed?

## Stretch

- A guided "demo tour" for portfolio visitors (5 steps, highlighting features), dismissible and
  remembered.
- Sound: a subtle optional chime for critical alerts (with a mute toggle). Then think hard about
  whether it should be on by default.
