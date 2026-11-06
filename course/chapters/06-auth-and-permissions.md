# Chapter 6 – Auth & permissions

> **Goal:** sign-in, protected routes, a session that survives reloads, role-based UI, and
> graceful handling of expired sessions. Along the way, meet React 19's form Actions.
> **Time:** 5–6 hours · **New libraries:** none (React 19 features, plus the router and Query you have)

## What you'll build

A `/login` page listing the demo accounts. Redirect to login (and back to where you were
afterwards) for every app route. The user menu shows name and role, and signs out. Observers see
read-only UI, with disabled actions that explain why. Expiring all sessions sends everyone back to
login with a friendly message and nothing broken.

## Angular bridge

| Angular | React |
|---|---|
| `AuthService` with a `currentUser` signal | `me` query + an `AuthProvider` context exposing `user`, `login`, `logout` |
| `HttpInterceptor` adding the token | `apiFetch` reads the token from an auth module |
| `canActivate` guard returning a `UrlTree` | `beforeLoad` that `throw redirect(...)` |
| `*hasRole="'operator'"` structural directive | `<Can permission="robot:command">` component and `usePermission()` hook |
| Reactive form for login | React 19 `<form action>` + `useActionState` (this chapter), RHF later |

---

## 6.1 Turn auth on

```js
await fetch('/api/sim/config', { method: 'PATCH', body: JSON.stringify({ requireAuth: true }) })
```

Reload. Everything 401s. That's the starting point. Look at how your app currently behaves (error
boundaries everywhere?). By the end of the chapter it should redirect cleanly instead.

> The setting persists in localStorage. In tests, pass `createTestBackend({ requireAuth: true })`.

## 6.2 The login page with React 19 Actions

Build `/login` **outside** the `_app` layout. Use React 19's form Actions rather than a form
library, so you meet them:

```tsx
const [state, formAction, isPending] = useActionState(loginAction, { error: null })
return <form action={formAction}>…<SubmitButton /></form>
```

- `loginAction(prevState, formData)` reads `email`/`password` from `FormData`, validates with a
  small Zod schema, calls the login endpoint and returns either errors or success.
- `SubmitButton` uses `useFormStatus()` to show pending state. It must be a **child** of the
  form. Find out why.
- Show field errors and the `invalid_credentials` message. Put the three demo accounts in a
  panel with "use this account" buttons that fill the form. (This is a public demo; make it easy.)

**Learn:** Actions are React's built-in answer for simple forms and mutations: pending state,
sequential submissions and progressive enhancement. They're great for small forms like this. For
the complex mission planner (chapter 10) you'll use React Hook Form. Knowing when to use which is
the real skill.

## 6.3 The session

- `features/auth/session.ts`: a **plain module** (outside React) holding the token, persisted to
  `sessionStorage`, with `getToken`, `setToken`, `clear`, and a `subscribe` for changes.
  `apiFetch` adds `Authorization: Bearer …` from it.
  > Real apps should prefer **httpOnly cookies** set by the server so JavaScript can't read the
  > token. Write two sentences in `docs/decisions.md` about why this demo uses `sessionStorage`
  > and what you'd do in production.
- `authQueries.me()`: `GET /api/auth/me`, with `staleTime: Infinity`; a 401 means "signed out"
  (return `null` rather than throwing).
- `AuthProvider` + `useAuth()`: exposes `user`, `status`, `login(email, password)` and `logout()`.
  On login: store the token, `setQueryData(me, user)`. On logout: call the endpoint, clear the
  token, and **`queryClient.clear()`**. Think about why that last one matters.

## 6.4 Route guards

- Add `auth` to the router context (the provider's value, passed into `RouterProvider`'s
  `context` prop). Call `router.invalidate()` when auth changes so guards re-run.
- `_app` route `beforeLoad`: if there's no user, `throw redirect({ to: '/login', search: { redirect: location.href } })`.
- After login, navigate to the validated `redirect` search param, or `/fleet`. **Validate it** so
  it can only be a path inside the app. An open redirect is a real vulnerability.
- Visiting `/login` while signed in should bounce to `/fleet`.

## 6.5 Permissions

`features/auth/permissions.ts`:

```ts
const permissions = {
  'robot:command': ['commander', 'operator'],
  'robot:edit': ['commander', 'operator'],
  'mission:edit': ['commander', 'operator'],
  'mission:delete': ['commander'],
  'event:ack': ['commander', 'operator'],
} as const satisfies Record<string, readonly Role[]>
```

- `usePermission('robot:command')` and `<Can permission="…" fallback={…}>`.
- **Hide or disable?** Decide per control. A disabled "Reboot" with a tooltip ("Observers have
  read-only access") explains the UI better than a missing button. Hide things that would just be
  noise.
- The server still enforces (403). Your UI is a convenience, not security. Make a 403 toast say
  something useful anyway.
- The rename robot feature from chapter 5 respects `robot:edit`.

## 6.6 Expired sessions, then test it

- In `QueryCache`/`MutationCache` `onError`: a **401** with a user present means the session
  expired → clear the session, toast "Your session expired, please sign in again", and
  redirect to login preserving the current URL.
- Try it: sign in, open a robot, run `fetch('/api/sim/expire-sessions', { method: 'POST' })`,
  then interact. One toast, one redirect, no error boundaries, no loops.
- Tests (with `requireAuth: true`):
  - unauthenticated visit to `/fleet/rb_atlas` → login → after sign-in, lands on Atlas
  - wrong password shows the error; the submit button shows pending
  - observer sees "Reboot" disabled with an explanation
  - expiring sessions mid-test redirects to login with the toast

---

## Definition of done

- [ ] Every app route is protected; `/login` is not
- [ ] Redirect-back works and can't be abused as an open redirect
- [ ] Login uses `useActionState` + `useFormStatus`
- [ ] Logout clears the token **and** the query cache
- [ ] Permissions are centralised; UI reflects them with explanations
- [ ] Expired sessions are handled once, globally, gracefully

## Polish pass

- The login page is designed, not default: product name, a one-line description, demo accounts
- Password field has a show/hide toggle; autofill works (`autoComplete` attributes)
- User menu shows avatar initials, name, role badge
- Focus goes to the first invalid field on error

## Review questions

1. Why must `useFormStatus` be used in a child of the `<form>`?
2. Why does the session live in a plain module instead of React state?
3. What could go wrong if you didn't clear the query cache on logout?
4. How did you prevent an open redirect?
5. Where is the real security boundary in this app?

## Stretch

- A "switch user" dev menu item that logs in as another demo account in one click.
- Read about refresh tokens and silent re-authentication. How would `apiFetch` retry a request
  after refreshing a token without creating a thundering herd?
