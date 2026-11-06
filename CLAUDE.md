# Hexapod Mission Control: notes for Claude

This repo is both a portfolio app and a guided React course. The owner is an experienced
Angular developer learning React by building it.

- **Coaching sessions** ("let's start chapter N", "section 5.3", "review my code"): follow
  `course/COACHING.md`. Read it plus `course/PROGRESS.md` and the relevant chapter in
  `course/chapters/` first. Hints before answers; don't write the app for them unless asked.
- **Architecture and state ownership:** `course/architecture.md`. **Visual/UX standard:**
  `course/design-brief.md`.
- **Backend:** `src/mocks/` is a simulated backend (MSW) documented in `docs/API.md`. App code
  must not import from `src/mocks` (except `main.tsx` and test setup). Its own tests are in
  `src/mocks/simulator.test.ts`.
- Library APIs change. If a chapter disagrees with the installed version, check the library's
  current docs and adapt, and note it under "Library drift" in `course/PROGRESS.md`.
