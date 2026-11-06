# Chapter 15 – Ship it

> **Goal:** a fast production build, continuous integration, a public deploy with preview
> environments, error monitoring, and a README and case study that make the portfolio piece land.
> **Time:** 6–8 hours · **New tools:** GitHub Actions, Vercel or Netlify (or Cloudflare Pages),
> Sentry, rollup-plugin-visualizer, web-vitals

## What you'll have

- A public URL that anyone can open, sign in to with a demo account, and use, with the
  simulator running in their browser.
- Every pull request runs lint, typecheck, unit, Storybook and E2E tests and gets its own
  preview deploy.
- Production errors reported to Sentry with source maps.
- A README that sells the project in 30 seconds, and a case study for the people who read further.

---

## 15.1 Production build and bundle

- `npm run build && npm run preview`. Click through everything. MSW must start in production:
  check `public/mockServiceWorker.js` is in `dist`, and the `serviceWorker.url` in
  `src/mocks/browser.ts` respects your deploy's base path.
- **Environment config:** anything that varies per environment goes in `VITE_*` variables
  (e.g. `VITE_SENTRY_DSN`), typed in `src/vite-env.d.ts`. Never put secrets in a SPA; everything
  in the bundle is public.
- **Bundle analysis:** `rollup-plugin-visualizer`. Confirm maplibre, three.js, Recharts and
  TanStack Table are each in their route chunks, not the entry. Look for duplicate packages and
  accidental imports (a barrel file pulling in everything?).
- Set a **budget**: entry JS under ~200 KB gzipped (adjust to your reality), and fail CI if it
  grows past it (e.g. a size-limit check).

## 15.2 Performance

- **Lighthouse** (incognito, mobile and desktop) on `/login` and `/fleet`. Aim for green across
  the board; write down what you fixed.
- **Web Vitals:** `npm i web-vitals` and log LCP, INP and CLS in development, and send them to
  Sentry in production.
- Typical fixes: preload the primary font, give skeletons and images fixed dimensions (CLS),
  defer the simulator's warm-up work if it delays first paint (measure it), and make sure
  telemetry processing never blocks input (INP).

## 15.3 Error monitoring

- Sentry's React SDK (free tier): init in `main.tsx` from `VITE_SENTRY_DSN`; integrate with your
  error boundaries (`Sentry.ErrorBoundary` or `captureException` in your fallbacks) and with
  TanStack Router for route-level performance traces.
- Upload **source maps** during the CI build (Sentry's Vite plugin), and don't serve them
  publicly unless you mean to.
- Tag events with app version (git SHA), and the user's role (not their identity: it's a demo,
  but practise good habits).
- Add a hidden "Throw test error" command in the palette to verify the whole pipeline.

## 15.4 Continuous integration

`.github/workflows/ci.yml`:

- Triggers: pull requests and pushes to `main`.
- Jobs (parallel where possible): **verify** (install with `npm ci`, lint, typecheck, unit with
  coverage, build); **e2e** (Playwright in the official container, using the built app, uploading
  the HTML report and traces as artefacts on failure); **storybook** (build and run its tests).
- Cache npm and the Playwright browsers.
- Branch protection on `main`: all jobs required. Work on branches from now on, one PR per
  feature.
- Dependabot or Renovate for dependency updates, grouped weekly.

## 15.5 Deploy

Pick one: **Vercel**, **Netlify** or **Cloudflare Pages**. All have free tiers and PR previews.

- Build command `npm run build`, output `dist`.
- **SPA fallback:** every path rewrites to `/index.html` so deep links like
  `/fleet/rb_atlas/twin` work on refresh. Make sure `mockServiceWorker.js` and assets are **not**
  rewritten.
- PR preview deploys, with their URL commented on the PR.
- Deploy Storybook too (a second project, or Chromatic), and link it from the README.
- Optional: a custom domain.
- Test the deployed site on a real phone and a tablet.

## 15.6 The portfolio pass

**README** (replace the in-development one):

1. One-sentence pitch and a **hero GIF** (map with robots moving, an alert arriving, a command
   being accepted, about 10 s). Record with Playwright's video, or any screen recorder, then compress.
2. **Live demo** link + demo accounts + "open the Chaos panel and break things".
3. Feature highlights with 3–4 screenshots.
4. **Architecture:** a Mermaid diagram of the data flow (REST → Query cache ← socket pushes;
   telemetry → live store → charts/map/twin) and the state-ownership table.
5. **Decisions:** link `docs/decisions.md` (or ADRs in `docs/adr/`): TanStack Router vs React
   Router, Query + Zustand split, socket outside React, phase-extrapolated twin, MSW as the
   backend.
6. **Quality:** test pyramid with numbers, Lighthouse scores, a11y audit, CI badge.
7. Run locally in three commands. Credit the course honestly ("built while learning React,
   following a structured project plan"). It shows initiative, not weakness.

**Case study** (blog post, LinkedIn article or `docs/case-study.md`, ~800 words): the problem,
three hard problems and how you solved them (live data without re-render storms; the mission
planner's map ↔ form sync; 60 fps twin from 2 Hz data), what you'd do next, and what an Angular
developer should know about React, in your own voice.

**CV / LinkedIn bullets:** two or three lines with concrete technologies and measurable outcomes
("virtualised a 5,000-row live event log; cut render time from X to Y ms").

**Final review:** walk the design brief's "What polished means" checklist one last time, in
both themes, on desktop, tablet and phone, keyboard-only.

---

## Definition of done

- [ ] Public demo URL working with deep links, demo accounts and the simulator
- [ ] CI required on `main`; PR previews; dependency updates automated
- [ ] Bundle analysed; heavy libraries code-split; budget enforced
- [ ] Lighthouse results recorded; Web Vitals reported
- [ ] Sentry receiving errors with source maps
- [ ] README with hero GIF, architecture, decisions and quality evidence; Storybook linked
- [ ] Case study published

## Review questions

1. Why can't a SPA keep secrets, and what does that mean for `VITE_*` variables?
2. What did the bundle analysis reveal, and what did you change?
3. Why must `mockServiceWorker.js` be excluded from the SPA rewrite?
4. What would change if a real backend replaced the simulator? List the files.
5. What are the three things you most want a reviewer to notice, and does your README make them
   impossible to miss?

## After the course

- Go back to `course/PROGRESS.md` and write a short retrospective: what clicked, what didn't,
  what you'd learn next.
- The bonus chapters ([A: Next.js](bonus-a-nextjs-status-page.md), [B: offline & i18n](bonus-b-pwa-and-i18n.md))
  round out the skills most React job descriptions ask for.
