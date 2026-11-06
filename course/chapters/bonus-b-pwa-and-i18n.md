# Bonus B – Offline-tolerant & international

> **Goal:** make the console usable in the field: survive flaky connectivity gracefully, work
> in a second language, and format everything correctly for the user's locale.
> **Time:** 4–6 hours · **New libraries:** i18next + react-i18next, TanStack Query persistence

## What you'll build

- A clear **offline mode**: a banner, cached data still browsable, mutations queued and replayed
  when the connection returns.
- The query cache **persisted** to IndexedDB, so a reload while offline still shows the last
  known fleet state.
- The whole UI in **two languages** (English + one you choose; Welsh is a nice nod to UK
  search-and-rescue, while German or Spanish are more commonly requested), switchable at runtime,
  with locale-aware numbers, dates, units and plurals.

## Angular bridge

| Angular | React |
|---|---|
| `@angular/localize` (compile-time, one build per locale) | react-i18next (runtime, one build, lazy-loaded translation files) |
| `DatePipe` / `DecimalPipe` with `LOCALE_ID` | `Intl.DateTimeFormat` / `Intl.NumberFormat` via your `format.ts`, locale from i18next |
| `@angular/service-worker` | See the note on service workers below |

---

## B.1 Offline as a first-class state

- TanStack Query's `onlineManager` already pauses queries when offline. Expose it with
  `useSyncExternalStore` (`onlineManager.subscribe`, `onlineManager.isOnline`) as `useIsOnline()`.
- **Offline banner** in the shell: "Offline – showing data from 14:32 UTC. Changes will be sent
  when you reconnect." Combine browser connectivity with your live-socket state: the socket can
  be down while the browser thinks it's online. Decide how to present both.
- **Mutations while offline:** with `networkMode: 'online'` (the default), mutations are
  *paused* and resumed automatically. Make paused mutations visible (`useMutationState` → "2
  changes waiting"). Which mutations should **not** be queued? (Robot commands from 10 minutes
  ago are dangerous. Make them fail fast offline, and say so in the UI.)
- Test with DevTools → Network → Offline. Note that MSW keeps answering while "offline" because
  it runs in the page, so simulate connectivity loss with `onlineManager.setOnline(false)` plus
  your socket's disconnect.

## B.2 Persist the cache

- Use TanStack Query's persistence (`PersistQueryClientProvider` with an async storage persister;
  check the docs for current package names) backed by IndexedDB (e.g. `idb-keyval`).
- Persist only what's useful: robots, missions, recent events. **Don't** persist the user
  session data or anything sensitive. Use `dehydrateOptions.shouldDehydrateQuery`.
- Set `buster` to your app version so a deploy invalidates old caches, and `maxAge` sensibly.
- Reload while offline: the fleet renders from cache with the offline banner. Clear the cache on
  logout.

> **About service workers:** an installable PWA needs a service worker to cache the app shell.
> This app's demo backend **is** a service worker (MSW), and two workers can't control the same
> scope. In a real deployment with a real backend, you'd add `vite-plugin-pwa` (Workbox) here.
> Read its docs and write a paragraph in `docs/decisions.md` on how you'd structure it. You don't
> need to fight MSW for the demo.

## B.3 i18n setup

```sh
npm i i18next react-i18next i18next-browser-languagedetector
```

- Initialise in `src/app/i18n.ts`: English bundled, other languages **lazy-loaded** (dynamic
  `import()` of JSON, or a backend plugin), with language detection and the choice persisted in
  your ui-store.
- Namespaces per feature (`fleet`, `missions`, `events`, `common`) so translation files stay
  manageable.
- Typed keys: declare your resources type so `t('fleet:card.battery')` is checked by TypeScript.

## B.4 Translate the app

- Replace user-facing strings with `t()` / `<Trans>`. Use **interpolation** and
  **plurals** (`"robotsOnline_one": "{{count}} robot online"`, `_other`). Never concatenate
  translated fragments.
- Status labels, command names, error messages from your API client (map `ApiError.code` to
  keys; fall back to the server message).
- **Pseudo-localisation** (a dev-only language that wraps strings in brackets and stretches them
  by 40%) to find untranslated strings and layouts that break with longer text.
- Accessible names (`aria-label`s) are user-facing too. Translate them.

## B.5 Locale-aware formatting

- Your `format.ts` takes the current locale: numbers (`1,234.5` vs `1.234,5`), percentages,
  dates and times (respecting the UTC/local preference), relative times
  (`Intl.RelativeTimeFormat`), and units (`Intl.NumberFormat` with `style: 'unit'`, e.g.
  `unit: 'celsius'`).
- Combine with the metric/imperial preference from chapter 7: temperature, distance and speed
  convert *and* format.
- date-fns: pass the matching date-fns locale wherever you format with it.
- Set `<html lang>` on language change. Check the layout in a right-to-left pseudo-locale with
  `dir="rtl"` to see how much would break (fixing it fully is out of scope).

## B.6 Test it

- Render a page in the second language and assert on translated text and number formats.
- A test that fails if any key used in code is missing from a translation file (a script or
  i18next's `saveMissing` in test mode).
- Offline: `onlineManager.setOnline(false)` → banner shows; a rename mutation is paused and
  shown as waiting; going online resumes it.
- Persistence: dehydrate a client with data, restore into a new client, render, and get data
  without a request.

---

## Definition of done

- [ ] Offline banner and paused-mutation indicator; robot commands refuse to queue
- [ ] Cache persisted to IndexedDB (selectively, versioned, cleared on logout)
- [ ] Two complete languages, lazy-loaded, typed keys, plurals correct
- [ ] Numbers, dates, units and relative times locale-aware
- [ ] Tests for translation completeness and offline behaviour

## Review questions

1. Why should some mutations queue offline and others not?
2. What did you exclude from persistence, and why?
3. Why is string concatenation with translated fragments a bug?
4. What did pseudo-localisation reveal?
5. How would you add an installable PWA alongside a real backend?
