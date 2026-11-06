# Chapter 10 – Mission planner

> **Goal:** the most complex form in the app: multi-step, field arrays, conditional fields,
> drag-to-reorder, a map you draw the route on, client and server validation, and protection
> against losing work.
> **Time:** 10–12 hours · **New libraries:** React Hook Form, @hookform/resolvers, dnd-kit,
> date-fns

## What you'll build

`/missions/new` and `/missions/$missionId/edit`: a three-step wizard.

1. **Details**: name, priority, robot (with its capabilities shown), schedule (now/later
   with date and time), notes.
2. **Route**: map + waypoint list side by side. Click the map to add a waypoint; drag markers
   to move; drag list items to reorder; choose an action per waypoint (move / scan / hold N
   seconds / lift N kg) with fields that appear as needed.
3. **Review**: summary, estimated duration and distance, then *Save draft*, *Schedule* or
   *Save & start*.

Plus a mission detail page with live progress, start and abort.

## Angular bridge

| Angular Reactive Forms | React Hook Form |
|---|---|
| `FormGroup` / `fb.group()` | `useForm({ resolver: zodResolver(schema), defaultValues })` |
| `formControlName` | `register('name')` / `<Controller>` / `useController` |
| `FormArray` | `useFieldArray({ name: 'waypoints' })` (append, remove, move, update) |
| Custom `ValidatorFn` / cross-field validators | Zod `.refine` / `.superRefine` |
| `valueChanges` | `useWatch` (subscribes narrowly, unlike `watch` at the root) |
| `control.setErrors` from API | `setError('waypoints.2.liftKg', { message })` |
| `canDeactivate` + dirty check | `useBlocker` + `formState.isDirty` |

**Where it breaks down:** RHF keeps values in refs (uncontrolled inputs), so typing doesn't
re-render the whole form. Reading values with `watch()` at the top of a big form undoes that,
so subscribe narrowly.

---

## 10.1 Schema first

`features/missions/form-schema.ts`. The **form** shape isn't the **API** shape:

- Waypoints are a **discriminated union** on `action`: `hold` requires `holdSeconds`
  (int 1–600), `lift` requires `liftKg` (> 0), the others neither.
- Schedule is `{ mode: 'now' | 'later', at?: Date }` in the form; the API wants
  `scheduledFor: number | null`. Write `toMissionInput(form)` and `fromMission(mission)` as pure,
  tested functions.
- Mirror the server's rules (name 3–80, ≤ 25 waypoints, label ≤ 40, within 5 km of base).
  The **lift limit depends on the chosen robot**: implement it with `superRefine` given a robots
  list (a schema factory `makeMissionFormSchema(robots)`), and report it at the exact path
  (`waypoints.N.liftKg`).

```sh
npm i react-hook-form @hookform/resolvers date-fns
```

## 10.2 Wizard structure

- One `useForm` at the wizard root; steps get it via `FormProvider` / `useFormContext`.
- Current step in the URL (`?step=route`) so refresh and back work. Values survive step changes
  because the form lives above the steps.
- "Next" validates only the current step's fields with `trigger(['name', 'robotId', …])`.
- Shared field components: `TextField`, `SelectField`, `NumberField`, `DateTimeField`, each
  showing label, description, error (from `getFieldState`) and wiring `aria-invalid` and
  `aria-describedby`. Build them on shadcn inputs (`npx shadcn@latest add input select
  textarea label radio-group`). shadcn also has a `Form` helper; using it is fine, but build one
  field by hand first so you know what it does.

**Robot select** shows each robot's model, max payload and availability (charging, busy, fault)
from the Query cache.

## 10.3 The waypoint list: field arrays

- `useFieldArray({ name: 'waypoints', keyName: 'key' })`. **Use the generated `field.key` as
  the React key**, not the index and not your own id. Find out why RHF insists.
- Each row: index badge, action select, conditional `holdSeconds` / `liftKg` inputs (use
  `useWatch({ name: \`waypoints.${i}.action\` })` *inside the row*), label, coordinates
  (read-only, mono), remove button.
- When the action changes away from `lift`, clear `liftKg` (`setValue` / `unregister`), or the
  discriminated union will complain.
- Empty state: "Click the map to add your first waypoint".

## 10.4 Drag to reorder (dnd-kit)

```sh
npm i @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- `DndContext` + `SortableContext` around the rows; `useSortable` per row with a **drag
  handle** (not the whole row, since rows contain inputs).
- On drag end, call the field array's `move(from, to)`.
- **Keyboard sensor** + screen-reader announcements ("Waypoint 3 moved to position 1"), so
  reordering is accessible. Test it with Space, arrows and Space.

> dnd-kit also has a newer `@dnd-kit/react` package. If the docs point you there, use it; the
> concepts are the same.

## 10.5 Map ↔ form sync

The Route step shows the chapter 9 map in "planning mode":

- **Click map → `append`** a `move` waypoint at that position. Clicks outside the 5 km radius
  are refused with a toast, and the radius is drawn on the map.
- Waypoint markers are **draggable** → `setValue(\`waypoints.${i}.position\`, …, { shouldDirty: true })`.
- The route line comes from `useWatch({ name: 'waypoints' })`. Reordering in the list redraws it
  instantly.
- Hovering a list row highlights its marker and vice versa (shared "hovered index" state in the
  wizard). Where should it live? Not in the form.
- **Estimates** on the Review step: total distance (haversine) and duration (robot speed by
  model/gait + 40 s per scan, 30 s per lift, hold seconds), as pure functions with tests.

## 10.6 Submit, server errors and unsaved changes

- `useMutation` for create (`POST`) / update (`PATCH`). *Save & start* chains `POST` then
  `POST /start`. Handle a `409` from start ("Atlas battery too low") by keeping the mission as
  a draft and saying so.
- **422 → field errors:** loop `ApiError.fieldErrors` and `setError(path, { message })`. The API
  uses the same dotted paths as RHF; that's no accident. Then jump to the step containing the
  first error and focus it. Force one: Scout robot + lift 100 kg (if your client validation
  doesn't already catch it, it should; temporarily disable it to see the server path work).
- **Unsaved changes:** `useBlocker({ shouldBlockFn: () => isDirty && !isSubmitSuccessful })`
  with your `useConfirm` dialog, plus `beforeunload` for tab close.
- **Edit mode:** `/missions/$missionId/edit` loads the mission (loader + Suspense) and resets
  the form with `fromMission(mission)`. Only `draft`/`scheduled` missions are editable; others
  redirect to the detail page.
- Schedule: show "Starts in 3 hours (14:30 UTC)" with date-fns (`formatDistanceToNow`,
  `format`), and reject times in the past.

## 10.7 Mission detail & test it

`/missions/$missionId`: header (name, priority, status, robot link), a progress stepper of
waypoints with the current one highlighted (live via the `mission` push), mini-map, start/abort
with confirmation and permissions, and the mission's events.

Tests (these are the most valuable in the app):
- Form: required fields show errors on Next; lift field appears only for `lift`; liftKg over the
  robot's payload shows the right message
- Field array: add three waypoints (call the handler directly or click the mocked map), remove
  one, reorder with the **keyboard**, then check the submitted payload order
- Server errors: override `POST /api/missions` to return a 422 with
  `waypoints.1.holdSeconds`; the error appears on that row and the wizard jumps to Route
- Blocker: navigating away from a dirty form asks for confirmation
- Pure functions: `toMissionInput`, `fromMission`, distance and duration estimates

---

## Definition of done

- [ ] Three-step wizard, URL-driven step, values preserved across steps
- [ ] Discriminated-union waypoints with conditional fields and robot-aware lift validation
- [ ] Drag to reorder with mouse **and** keyboard
- [ ] Map and list stay in sync both ways
- [ ] Server 422s land on the exact field; 409 on start handled
- [ ] Unsaved changes are protected; edit mode works
- [ ] Mission detail shows live progress

## Polish pass

- Waypoint numbers on the map match the list at all times, including mid-drag
- Typing in a field doesn't re-render the map (check with highlight updates)
- Every field has a helpful description; errors say how to fix, not just what's wrong
- The Review step reads like a briefing, not a JSON dump

## Review questions

1. Why does RHF want `field.key` as the React key in field arrays?
2. Why are the form schema and the API schema different, and where do they meet?
3. How did you make liftKg validation depend on the selected robot?
4. Where does "hovered waypoint" state live, and why not in the form?
5. What triggers the blocker, and what doesn't?

## Stretch

- Undo/redo for route edits (a history stack of waypoint arrays).
- Import a route from a GeoJSON file (drag and drop onto the map).
- Mission templates: "save as template", then "new from template".
