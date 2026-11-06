# Hexapod Mission Control

A command centre for a fleet of six-legged search-and-rescue robots: live telemetry, an
operations map, a mission planner, a 3D digital twin of each robot, and an event log built to
handle thousands of entries.

> **Status: in development.** I'm building this as a structured deep-dive into React and its
> ecosystem, coming from eight years of Angular. The course I'm following lives in
> [`course/`](course/README.md). This README becomes the full project write-up when the app is
> finished.

<!-- Chapter 15: hero GIF here -->

## Features (planned)

- **Fleet overview:** live status, battery and activity for every robot
- **Operations map:** robots, trails, mission routes and survivor detections on a live map
- **Mission planner:** draw routes on the map, reorder waypoints by drag-and-drop, validate
  against each robot's capabilities, schedule or launch
- **Telemetry:** live charts and instrument gauges for battery, motors, IMU and signal
- **Digital twin:** a 3D model of each hexapod animated from its joint telemetry
- **Event log:** filter, search and bulk-acknowledge thousands of events in a virtualised table
- **Roles:** commander, operator and observer, each with different permissions

## Stack

React 19 · TypeScript · Vite · TanStack Router · TanStack Query · Zustand · Tailwind CSS ·
shadcn/ui · React Hook Form · Zod · Recharts · MapLibre GL · React Three Fiber · TanStack Table
& Virtual · Motion · Vitest · Testing Library · Playwright · Storybook · MSW

## The backend is a simulator

There's no server. A simulated backend runs in the browser via [Mock Service Worker](https://mswjs.io):
REST endpoints plus a WebSocket feed, with robots walking missions, batteries draining, motors
overheating and comms dropping out. The live demo works with no infrastructure, and the app is
written against a real HTTP/WebSocket contract ([`docs/API.md`](docs/API.md)), so swapping in a
real backend would only change a URL.

## Run it locally

```sh
npm install
npm run dev
```

Demo accounts (once sign-in is enabled): `commander@hexapod.dev`, `operator@hexapod.dev`,
`observer@hexapod.dev`, all with the password `mission-control`.
