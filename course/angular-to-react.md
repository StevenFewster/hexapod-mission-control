# Angular → React cheat sheet

Mappings from modern Angular (standalone components, signals, new control flow) to React 19 and
the libraries this course uses. "≈" means similar purpose but a different model. Read the
"breaks down" notes; that's where the bugs come from.

## The core mental model

| Angular | React | Notes |
|---|---|---|
| Component class + template + change detection | **A function that returns UI** for the current props and state | React calls your component function again (re-renders) whenever its state, its parent or a subscribed context changes. No zones and no dirty checking: re-rendering *is* the change detection. |
| Template syntax | **JSX**, which is just JavaScript expressions | `{cond && <X/>}`, `{items.map(i => <Row key={i.id} …/>)}`. No template language to learn, no pipes. |
| Signals (`signal`, `computed`) | `useState` + plain variables computed during render | Derived values are just `const total = items.length` in the function body. Wrap them in `useMemo` only if they're expensive. |
| `OnPush` | Default behaviour + `memo()` / React Compiler | Every render of a parent re-renders its children unless memoised. Usually fine. The React Compiler (chapter 8) memoises automatically. |
| Immutability "recommended" | Immutability **required** | React compares by reference. `items.push(x); setItems(items)` does nothing. Use `setItems([...items, x])`. |

## Components

| Angular | React |
|---|---|
| `@Component({ selector: 'hmc-robot-card' })` | `export function RobotCard(props: RobotCardProps) { … }` |
| `input()` / `@Input()` | Props: `function RobotCard({ robot, compact = false }: Props)` |
| `input.required()` | A non-optional prop in the props type |
| `output()` / `@Output() + EventEmitter` | Callback props: `onSelect={(id) => …}`, named `onX` by convention |
| `model()` / two-way `[(x)]` | Controlled pair: `value` + `onChange` props |
| `<ng-content>` | `children` prop |
| Multi-slot `<ng-content select="…">` | Named props that take JSX: `<Card header={<h2/>} footer={…}>` or compound components (`<Card.Header>`) |
| `ng-template` + `ngTemplateOutlet` | Render props: `renderItem={(item) => <Row …/>}`, or just a component |
| `host` bindings / `HostListener` | Put the props/handlers on the root element you return |
| Attribute directives | Custom hooks (`useHotkeys(…)`), or wrapper components |
| Structural directives | Plain JS in JSX (`&&`, ternaries, `.map`) |
| `@if` / `@else` | `{cond ? <A/> : <B/>}` |
| `@for (x of xs; track x.id)` | `{xs.map(x => <Item key={x.id} …/>)}`; `key` = `track` |
| `@switch` | An object lookup or a small helper component; `switch` inside the component body |
| `@defer` | `lazy()` + `<Suspense>`; route-level code splitting is automatic with TanStack Router |
| `ViewChild` / `ElementRef` | `useRef` + `ref={…}` |
| `ViewEncapsulation` / component CSS | Tailwind utility classes (this course), CSS Modules, or CSS-in-JS |
| `ngClass` | `className={cn('base', active && 'ring-2')}` |
| Pipes (`date`, `number`, `async`) | Functions (`formatDistance(…)`, `Intl.NumberFormat`). No `async` pipe: hooks give you values. |

## Lifecycle → there isn't one (mostly)

| Angular | React | Breaks down because… |
|---|---|---|
| `constructor` / field initialisers | Top of the function body, `useState(() => init)` for expensive init | The body runs on **every** render, so nothing expensive or side-effecting belongs there. |
| `ngOnInit` (fetch data) | TanStack Query / route loaders | Don't fetch in `useEffect` in real code (chapter 2 shows why). |
| `ngOnChanges` | Compute during render, or `key` to reset | Syncing props into state is the #1 effect anti-pattern. |
| `ngAfterViewInit` (touch the DOM) | `useEffect` / `useLayoutEffect` with a ref | Runs after paint (layout effect runs before). |
| `ngOnDestroy` | The cleanup function returned from `useEffect` | Cleanup also runs before the effect re-runs, not only on unmount. |
| `DestroyRef`, `takeUntilDestroyed` | Effect cleanup | Same idea. |

**StrictMode** (dev only) mounts every component, unmounts it and mounts it again, to prove your
effects clean up properly. If something happens twice in dev, your cleanup is wrong. It's not a
React bug.

## Dependency injection & services

| Angular | React |
|---|---|
| `@Injectable({ providedIn: 'root' })` holding **server data** | **TanStack Query** (chapter 5). The cache is the "service". |
| Service holding **shared UI/client state** (signals/BehaviorSubject) | **Zustand** store (chapter 7) |
| Service as a dependency (API client, logger, feature flags) | A plain module (`import { api } from '@/lib/api'`), or **Context** if it must vary per subtree or in tests |
| `inject(Token)` | `useContext(SomeContext)`, or `use(SomeContext)` in React 19 |
| Hierarchical injectors | Nested `<Context.Provider>`s |
| `APP_INITIALIZER` | Code before `createRoot().render()`, or a route `beforeLoad`/loader |

React has no DI container. Modules are singletons, and Context is a scoped value, not a
service locator.

## RxJS → ?

| Angular/RxJS | React |
|---|---|
| `HttpClient` + `Observable` per request | `fetch` wrapper + TanStack Query (caching, dedupe, retries, refetch on focus) |
| `switchMap` on a search box | Debounced value in the query key: `useQuery({ queryKey: ['robots', debounced] })` |
| `combineLatest` of several streams | Several hooks in one component; derive during render |
| `BehaviorSubject` store | Zustand |
| WebSocket `Subject` | An external store + `useSyncExternalStore`, or push into Zustand/Query cache (chapter 7) |
| `async` pipe | The hook returns the value |
| `shareReplay` | Query cache / Zustand |

## Routing

| Angular Router | TanStack Router (this course) | React Router v7 (for reference) |
|---|---|---|
| `Routes` config | File-based routes in `src/routes/` (generated, type-safe tree) | `createBrowserRouter([…])` or framework mode |
| `<router-outlet>` | `<Outlet />` | `<Outlet />` |
| `routerLink` | `<Link to="/fleet/$robotId" params={{ robotId }}>`, type-checked | `<Link to={`/fleet/${id}`}>` |
| `ActivatedRoute.params` | `Route.useParams()` | `useParams()` |
| Query params | `Route.useSearch()`, **validated with Zod and typed** | `useSearchParams()` (strings) |
| Resolvers | `loader` (+ `queryClient.ensureQueryData`) | `loader` |
| Guards (`canActivate`) | `beforeLoad` + `throw redirect(…)` | loader + `redirect` |
| `canDeactivate` | `useBlocker` | `useBlocker` |
| Lazy routes | Automatic code splitting (Vite plugin) | `lazy` |

## Forms

| Angular Reactive Forms | React Hook Form + Zod |
|---|---|
| `FormGroup` / `FormBuilder` | `useForm<FormValues>({ resolver: zodResolver(schema), defaultValues })` |
| `FormControl` binding | `{...register('name')}` or `<Controller>` for custom inputs |
| `FormArray` | `useFieldArray({ name: 'waypoints' })` |
| Validators | Zod schema, shared with your API parsing |
| `valueChanges` | `watch('field')` / `useWatch` |
| `setErrors` from server | `setError('waypoints.2.liftKg', { message })` |
| `dirty`, `touched`, `valid` | `formState.isDirty`, `touchedFields`, `isValid` |
| Template-driven forms | Plain controlled inputs with `useState`, fine for one or two fields. Or React 19 `<form action={…}>` with `useActionState` (chapter 6). |

## Testing

| Angular | React |
|---|---|
| TestBed | `render(<Component/>)` from Testing Library, with a custom `renderWithProviders` |
| `fixture.detectChanges()` | Not needed. Use `await screen.findBy…` for async UI. |
| `HttpTestingController` | MSW, the same handlers the app uses in dev |
| `DebugElement.query(By.css())` | `screen.getByRole('button', { name: /start mission/i })`. Query like a user would. |
| Karma/Jasmine (or Jest) | Vitest (Jest-compatible API) |
| Cypress / Protractor | Playwright |

## Vocabulary

| You'd say (Angular) | React people say |
|---|---|
| change detection | re-render |
| smart/container vs presentational component | same idea, less ceremony; hooks make "smart" components small |
| module | there are none; just ES modules |
| service | hook, store, or module, depending on what it does |
| directive | hook or component |
| `trackBy` | `key` |
| zone | (nothing) |
