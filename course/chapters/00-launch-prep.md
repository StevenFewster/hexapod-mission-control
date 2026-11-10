# Chapter 0 – Launch prep

> **Goal:** a modern React + TypeScript project with linting, formatting and tests, the simulated
> backend running in your browser, and a first look at how React renders.
> **Time:** 3–4 hours · **New libraries:** Vite, Vitest, Testing Library, MSW

## What you'll have at the end

`npm run dev` opens a page that says "Hexapod Mission Control". The browser console shows
`🛰 Hexapod simulator online`, and `fetch('/api/robots')` returns six robots. `npm test` runs
the simulator's own test suite (17 passing) plus your first component test.

## Angular bridge

| Angular CLI                                      | Here                                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `ng new`                                         | `npm create vite@latest` (React has no official CLI; Vite is the de-facto standard for SPAs) |
| `angular.json`                                   | `vite.config.ts` (much smaller)                                                              |
| `main.ts` + `bootstrapApplication(AppComponent)` | `main.tsx` + `createRoot(el).render(<App />)`                                                |
| `AppComponent`                                   | `App.tsx`, just a function                                                                   |
| Karma/Jasmine                                    | Vitest + Testing Library                                                                     |
| `ng lint`                                        | ESLint (flat config)                                                                         |

**Where it breaks down:** there's no framework-wide "way" of doing things. Routing, data,
forms and styling are all libraries you choose. This course chooses for you, and explains the
alternatives as it goes.

---

## 0.1 Scaffold the app

The repo already contains `src/mocks/` (the backend), `docs/` and `course/`. Scaffold Vite
next to them **without overwriting** anything:

```sh
# from the repo root
npm create vite@latest ../hmc-scaffold -- --template react-ts
cp -Rn ../hmc-scaffold/. .     # -n = never overwrite existing files (keeps README.md)
rm -rf ../hmc-scaffold
npm install
npm run dev
```

> Windows: run this in Git Bash or WSL. Use Node 22 LTS or newer (`node -v`).

Open the URL Vite prints. Then read these four files, in this order, and make sure you can
explain each line:

1. `index.html` – the real entry point. Note the `<script type="module" src="/src/main.tsx">`.
2. `src/main.tsx` – `createRoot(...).render(<StrictMode><App /></StrictMode>)`.
3. `src/App.tsx` – a function that returns JSX.
4. `vite.config.ts` – one plugin: `@vitejs/plugin-react`.

**Learn: what JSX is.** `<App />` compiles to roughly `jsx(App, {})`. JSX is a function call
that returns a plain object describing UI. React calls your component function, gets that
description back, and works out what to change in the DOM. There's no template compiler and no
zone; **re-running your function is how React finds out what changed.**

**Check:** delete everything inside `App`'s return and render `<h1>Hexapod Mission Control</h1>`.
Delete `App.css`, the logo assets and their imports.

## 0.2 Tighten TypeScript, add a path alias, set up linting & formatting

1. In `tsconfig.app.json`, keep everything the template set (it's already strict) and add:
   ```jsonc
   "noUncheckedIndexedAccess": true,
   "paths": { "@/*": ["./src/*"] }
   ```
   (No `baseUrl`; TypeScript 6 deprecates it, and `paths` resolves relative to the tsconfig.)
2. Teach Vite the same alias. `npm i -D @types/node`, then in `vite.config.ts`:
   ```ts
   import path from 'node:path'
   // …
   resolve: { alias: { '@': path.resolve(__dirname, './src') } },
   ```
3. Formatting: `npm i -D prettier eslint-config-prettier`. Add a `.prettierrc` (the course uses
   `{ "semi": false, "singleQuote": true, "printWidth": 100 }`; pick your own). Add
   `eslint-config-prettier` as the last entry in `eslint.config.js` so ESLint and Prettier don't
   fight.
4. Scripts in `package.json`:
   ```json
   "typecheck": "tsc -b",
   "lint": "eslint .",
   "format": "prettier --write ."
   ```

**Learn:** open `eslint.config.js`. The template enables `eslint-plugin-react-hooks`. Its
rules (`rules-of-hooks`, `exhaustive-deps`) are the most valuable lint rules in React.
**Treat its warnings as errors** for the whole course.

**Check:** `npm run lint` passes with zero warnings. `npm run typecheck` will still complain
that it can't find `msw` and `vitest` (imported by `src/mocks`). That's expected; you install
them in 0.3 and 0.5.

## 0.3 Start the simulated backend

The backend is [Mock Service Worker](https://mswjs.io): a service worker that intercepts
`fetch`, plus an in-page WebSocket interceptor. It has to be running **before** the app makes
its first request.

```sh
npm i -D msw
npx msw init public/ --save      # copies mockServiceWorker.js into public/
```

Now change `src/main.tsx` so it starts the backend, then renders:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startMockBackend } from '@/mocks/browser'
import App from './App'
import './index.css'

async function bootstrap() {
  await startMockBackend()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
```

> We start MSW in production builds too, on purpose. The simulator _is_ this app's backend, and
> it's what makes the public demo work with no server (chapter 15).

**Check:** reload. In the browser console:

```js
await (await fetch('/api/robots')).json() // six robots
__sim.world.trigger('fault') // break something
await (await fetch('/api/events?limit=3')).json()
```

Skim [`docs/API.md`](../../docs/API.md) end to end now. Don't memorise it, just know what's
there. Then glance at `src/mocks/types.ts`. **Rule:** app code never imports from `src/mocks`
(except `main.tsx` and test setup). It's another team's service.

## 0.4 Your first render cycle

Put a `console.log('App rendered')` in the body of `App`. Reload and look at the console.

- **It logs twice.** That's `StrictMode` in development: React renders components twice
  (and mounts, unmounts and remounts effects) to flush out impure code. Production renders once.
- Add `const [count, setCount] = useState(0)` and a button that calls `setCount(count + 1)`.
  Every click logs again: **state change → React calls your function again → new JSX →
  React patches the DOM.** That's the whole loop.
- Now try `setCount(count + 1); setCount(count + 1)` in one click handler. Why does it only go
  up by one? (Hint: `count` is a constant in this render. Search "state as a snapshot".) Then
  try `setCount(c => c + 1)` twice.

Remove the experiments when you're done.

**Learn:** components must be **pure during render**: same props and state in, same JSX out, no
side effects. Side effects go in event handlers (most of them) or effects (rarely). This one rule
explains most of React's design.

## 0.5 Testing setup

```sh
npm i -D vitest jsdom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom
```

1. In `vite.config.ts` add `/// <reference types="vitest/config" />` at the top, and:
   ```ts
   test: {
     environment: 'jsdom',
     globals: false,
     setupFiles: ['./src/test/setup.ts'],
   },
   ```
2. `src/test/setup.ts`:
   ```ts
   import '@testing-library/jest-dom/vitest'
   import { cleanup } from '@testing-library/react'
   import { afterEach } from 'vitest'
   afterEach(() => cleanup())
   ```
3. Scripts: `"test": "vitest"`, `"test:run": "vitest run"`.
4. Run `npm test`. The **simulator's own 17 tests** in `src/mocks/simulator.test.ts` should pass.
   That proves the backend works on your machine.
5. Write `src/App.test.tsx`: render `<App />` and assert the heading is there using
   `screen.getByRole('heading', { name: /hexapod mission control/i })`.

**Learn: query by role.** Testing Library pushes you to find elements the way a user (or screen
reader) does: by role and accessible name, not CSS selectors. If a test can't find your button
by role, a screen reader user probably can't either.

**Check:** `npm run test:run` → all green.

## 0.6 First commit & housekeeping

1. Make sure `.gitignore` (from the template) covers `node_modules`, `dist`, `coverage`.
2. Commit: `chore: scaffold vite react-ts app with simulator, lint, format and tests`.
3. Push to GitHub.
4. Update `course/PROGRESS.md`.

Optional but recommended: `npm i -D husky lint-staged` to run Prettier and ESLint on staged files
before each commit.

---

## Definition of done

- [x] `npm run dev` shows the heading; console shows the simulator online
- [x] `npm run typecheck`, `npm run lint`, `npm run test:run` all pass with zero warnings
- [x] `@/` alias works in both Vite and TypeScript
- [x] You can explain what StrictMode is doing when things log twice
- [x] Pushed to GitHub

## Review questions

1. What does `<App />` compile to, and what does React do with the result?
2. Why must a component be pure during render? Name two things you're not allowed to do in a
   component body.
3. Why did calling `setCount(count + 1)` twice only add one?
4. Where does the "backend" run, and what intercepts the requests?
5. Why query by role in tests instead of `container.querySelector('.title')`?

## Stretch

- Read the first three pages of react.dev → _Learn_ → _Describing the UI_. You'll fly through
  them, but the vocabulary is the one Claude will use.
- Install the **React Developer Tools** browser extension and find the `App` component in the
  Components tab.
