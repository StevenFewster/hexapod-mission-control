# Chapter 3 – Design system

> **Goal:** a consistent, accessible component kit and the application shell, built the way most
> professional React teams do it today.
> **Time:** 6–8 hours · **New libraries:** shadcn/ui (Radix UI primitives + cva), sonner

## What you'll build

The app shell from the design brief (nav rail, status strip with a UTC clock, main area), a
working dark/light/system theme switch, and your fleet UI rebuilt on shared components: `Button`,
`Badge`, `Card`, `Tooltip`, `DropdownMenu`, `Tabs`, `Dialog`, `Sheet`, `Skeleton`, toasts, plus
your own `Panel`, `EmptyState`, `ErrorState` and `ConfirmDialog`.

## Angular bridge

| Angular | React |
|---|---|
| Angular Material components | shadcn/ui components |
| Angular CDK (overlay, a11y, focus trap) | Radix UI primitives (what shadcn is built on) |
| `MatSnackBar` | sonner toasts |
| `MatDialog.open(Component)` | Declarative `<Dialog open={…}>`, or an imperative `confirm()` you build in 3.5 |
| Component inputs for variants (`color="primary"`) | `cva` variant props (`variant="destructive" size="sm"`) |
| Content projection with selectors | Compound components (`<Panel.Header>`) or slot props |

**Where it breaks down:** shadcn/ui isn't a dependency you upgrade. It's a generator that
copies component **source** into your repo. You own and edit the code. That's the point:
no fighting a library's theming API, but also no automatic updates.

---

## 3.1 Install shadcn/ui and connect it to your tokens

Follow the official **Vite** installation guide at ui.shadcn.com (it relies on the `@/` alias
you set up in chapter 0). Then:

```sh
npx shadcn@latest add button badge card tooltip dropdown-menu tabs dialog alert-dialog sheet skeleton separator sonner
```

shadcn writes its own CSS variables (`--background`, `--foreground`, `--primary`, `--muted`,
`--destructive`, `--border`, `--ring`, …). **Point them at your brand tokens** from chapter 1
instead of keeping two palettes: e.g. `--background: var(--bg)`, `--primary: var(--live)`,
`--destructive: var(--danger)`, in both `:root` and `.light`. Make sure shadcn's dark-mode
mechanism and yours agree (one class on `<html>`).

**Read the generated code.** Open `components/ui/button.tsx` and `dialog.tsx` and find:
- `cva(...)`: variants as data
- `Slot` / `asChild`: polymorphism
- the Radix primitive being wrapped, and which props pass through
- how `ref` is handled (React 19 passes `ref` as an ordinary prop)

## 3.2 Variants with `cva`

Refactor `StatusBadge` to use `cva` with a `tone` variant (`ok | live | caution | danger | idle`),
and derive the props type with `VariantProps<typeof badgeVariants>`. Add a `size` variant.

Then use `Button` everywhere. Practise `asChild`: `<Button asChild><a href="…">Docs</a></Button>`
renders an `<a>` with button styles. No wrapper element, and the semantics stay correct. You'll use
this with router `<Link>`s next chapter.

## 3.3 The application shell

`components/app-shell.tsx`:

- **Nav rail** with icon buttons for Fleet, Map, Missions, Events, Detections, Settings.
  Every icon button has a `Tooltip` **and** an accessible name (`aria-label` or visually hidden
  text). Links are placeholders until chapter 4.
- **Status strip:** connection placeholder (grey "offline" dot for now), a **UTC clock** that
  ticks every second, fleet counts, an alerts button, and a user menu (`DropdownMenu`).
- **Responsive:** below 768 px the rail becomes a bottom bar or a `Sheet` behind a menu button.

The clock is a nice lesson in render scope. Put the `setInterval` in a tiny `<UtcClock />`
component so **only the clock** re-renders every second, not the whole shell. Prove it with
React DevTools → *Highlight updates when components render*.

**Theme switching:** a `ThemeProvider` using **Context** that holds `'dark' | 'light' | 'system'`,
persists to `localStorage`, applies the class to `<html>`, and follows `prefers-color-scheme`
when set to system (`matchMedia` + a change listener in an effect). Expose `useTheme()`.
Add the toggle to the user menu.

**Learn: Context** is dependency injection for a subtree: a value plus a hook to read it.
It's great for rarely-changing values (theme, current user, config). Every consumer re-renders
when the value changes, so it's a poor fit for fast-changing data. You'll compare it with
Zustand in chapter 7.

## 3.4 Compound components & shared states

Build a `Panel` for the dashboard boxes you'll need everywhere:

```tsx
<Panel>
  <Panel.Header title="Motors" actions={<Button size="sm">…</Button>} />
  <Panel.Body>…</Panel.Body>
</Panel>
```

Use a small context so sub-components can share state (e.g. a collapsible panel where
`Panel.Header` toggles and `Panel.Body` hides). Compare this API with a single
`<Panel title actions collapsible>` with lots of props. When is each better?

Also finalise `EmptyState` and `ErrorState` (with a `retry` callback), and a `PageHeader`
(title, description, actions). Refactor the fleet page to use all of them.

## 3.5 Toasts and an imperative confirm

- Add `<Toaster />` (sonner) to the root and theme it with your tokens.
- Build `useConfirm()`, which returns `confirm({ title, description, confirmLabel, tone })`, a
  function that returns a **Promise<boolean>** and opens a single shared `AlertDialog`
  rendered by a `ConfirmProvider`. Usage:
  ```ts
  if (await confirm({ title: 'Reboot Atlas?', tone: 'danger' })) { … }
  ```
  This is a classic pattern: an imperative API on top of declarative UI. It's the closest thing
  to `MatDialog.open()`, and a good exercise in storing a `resolve` function in a ref.
- Wire a temporary "Reboot" item in each card's menu that confirms, then shows a toast.

## 3.6 Accessibility pass & test it

- Keyboard-only: tab through the shell. Open the user menu with Enter, move with arrows, close
  with Esc, and check focus returns to the trigger. Radix does most of this; make sure you didn't
  break it.
- `npm i -D vitest-axe` (or `jest-axe`) and add an axe check to your fleet page test.
- Tests: the theme toggle switches the `<html>` class; `useConfirm` resolves `true`/`false` for
  confirm/cancel; the dropdown is operable with the keyboard (`user.keyboard('{Enter}')`).

---

## Definition of done

- [ ] shadcn variables map onto your tokens; one palette, two themes
- [ ] App shell with nav rail, status strip (live UTC clock), user menu, theme switch
- [ ] Shell works from phone to desktop
- [ ] Fleet UI uses shared components; no one-off buttons
- [ ] `useConfirm()` works and is tested
- [ ] Axe reports no violations on the fleet page

## Polish pass

- Consistent focus rings (`--ring` = your live colour) on every interactive element
- Tooltips on every icon-only control, with a sensible delay
- Skeletons replace all loading placeholders
- The light theme gets the same care as the dark one

## Review questions

1. Why does shadcn copy source into your repo instead of shipping a package? What's the cost?
2. What does `asChild` do, and why is it better than wrapping a `<Link>` in a `<Button>`?
3. Why put the clock in its own component?
4. When is Context the right tool, and when isn't it?
5. How does `useConfirm()` turn a dialog into a Promise?

## Stretch

- A `Kbd` component for shortcut hints in tooltips (`/` for search).
- Read the Radix docs for `DropdownMenu` and find one accessibility feature you didn't know about.
