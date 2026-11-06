# Chapter 11 – Event log at scale

> **Goal:** a dense, fast, live data grid over thousands of rows, with headless table logic,
> infinite loading, virtualisation, faceted filters and bulk actions.
> **Time:** 8–10 hours · **New libraries:** TanStack Table, TanStack Virtual

## What you'll build

`/events`: a virtualised table of the fleet log (time, level, robot, source, code, message,
acknowledged) that scrolls smoothly through all 5,000+ historical events, loading pages as you
go. It has faceted filters (level, source, robot, acknowledged) and text search, all in the URL. Live
events slide in at the top, or collect behind a "12 new events" pill if you've scrolled down.
Select rows (or all matching) and acknowledge in bulk. Export what you see to CSV. The status
strip's alert count stays correct throughout.

## Angular bridge

| Angular | React |
|---|---|
| `mat-table` + `MatSort` + `MatPaginator` | TanStack Table: **headless** logic, your markup |
| CDK `cdk-virtual-scroll-viewport` | TanStack Virtual (`useVirtualizer`) |
| `SelectionModel` | Table row selection state |
| Infinite scroll with `scan()` accumulating pages | `useInfiniteQuery` (pages cached together) |

**Where it breaks down:** "headless" means the library gives you state and row models, and
renders nothing. You write every `<tr>`. More work, total control, and it pairs naturally with
virtualisation and your design system.

---

## 11.1 Infinite query

`eventQueries.list(filters)` with `infiniteQueryOptions`:

- `queryFn: ({ pageParam }) => apiFetch('/api/events?...&cursor=' + pageParam)`,
  `initialPageParam: null`, `getNextPageParam: (last) => last.nextCursor`.
- Filters are part of the **query key**, so changing a filter is a different cache entry (and
  going back is instant).
- Flatten pages for rendering (`data.pages.flatMap(p => p.items)`), and show `total` from the
  first page ("Showing 150 of 5,214").

## 11.2 TanStack Table

```sh
npm i @tanstack/react-table
```

- Column definitions with `createColumnHelper<FleetEvent>()`. Custom cells: level badge,
  robot callsign as a link (lookup from the robots query, not the event), relative time with an
  absolute-time tooltip, message truncated with a tooltip, and acknowledged as a check or an "Ack"
  button.
- Use `getCoreRowModel()`; the server does filtering and ordering (newest first). Decide whether
  any client-side sorting makes sense with infinite data. (Probably not. Say why.)
- **Column visibility** menu (DropdownMenu with checkboxes) and **column sizing**, persisted
  in the ui-store.
- Render with real `<table>` semantics (or `role="grid"` if you go the div route) so screen
  readers get headers.

## 11.3 Virtualisation

```sh
npm i @tanstack/react-virtual
```

- `useVirtualizer({ count: rows.length, getScrollElement, estimateSize: () => 36, overscan: 12 })`.
  Render only the visible rows, offset with padding rows or `transform`.
- **Load more** when the last virtual item is within ~20 rows of the end and
  `hasNextPage && !isFetchingNextPage`. A loader row at the bottom.
- Sticky header that stays aligned with columns.
- Measure: temporarily render all rows without virtualisation after loading 3,000 (scroll to
  the bottom a few times). Compare DOM node count and scroll smoothness in the Performance
  panel. Write the numbers down.

## 11.4 Filters & search

- Faceted multi-select filters as `Popover` + `Command` (shadcn) with checkboxes and counts.
  Robots come from the robots query.
- Text search debounced into the URL (`?q=overtemp`).
- Quick filters: "Needs attention" (`level=warning,error,critical&acknowledged=false`), "This
  robot only" (from the robot detail Log tab, which reuses this whole component with a fixed
  robot filter).
- **`useTransition`:** wrap the URL/filter update in `startTransition` so the input stays
  responsive while the table re-renders; use `isPending` to dim the table. Compare typing with
  and without it under 6× CPU throttling in DevTools.

## 11.5 Live events

When an `event` arrives on the socket (chapter 7's sync module):

- If it **matches the current filters** (write a pure `matchesFilters(event, filters)` that
  mirrors the server's rules), prepend it to the **first page** of the cached infinite query
  with `setQueryData`. Careful with immutability: new `pages` array, new first page, new
  `items` array. Increment `total`.
- If the user has scrolled away from the top, don't move their rows. Collect new events and
  show a **"N new events" pill**. Clicking it scrolls to the top and reveals them. Keep the
  scroll position anchored when rows are inserted above.
- New rows get a brief highlight (chapter 13 will animate it properly).
- Invalidate `stats` so the status-strip alert count updates.

## 11.6 Selection, bulk acknowledge, export

- Row selection with a checkbox column; shift-click selects a range; header checkbox selects all
  **loaded** rows; a banner offers "Select all 214 matching" (which acknowledges by filter).
  Think about how: the API takes ids, ≤ 500 per call, so batch it.
- **Bulk acknowledge** mutation (`POST /api/events/acknowledge`): optimistic across all cached
  pages and filter variants (`setQueriesData` with a key prefix), then invalidate. Respect the
  `event:ack` permission.
- Single-row "Ack" button, and keyboard: `x` toggles selection, `a` acknowledges the focused row.
- **Export CSV** of the currently loaded and filtered rows: build the CSV string, then download
  via a `Blob` and an object URL. Escape commas, quotes and newlines properly.

## 11.7 Test it

- `matchesFilters` and CSV escaping: thorough unit tests (pure)
- Table: renders the first page; changing the level filter updates the URL and the rows
- Infinite: scrolling to the end requests the next page. Virtualisers need layout, which jsdom
  doesn't have, so mock element sizes (`getBoundingClientRect` / `offsetHeight`) or test the
  "load more" trigger through its handler
- Live: `backend.world.log('error', 'motor', 'TEST', 'Test event', 'rb_atlas')` while the
  table is open → row appears at the top (if matching) or the pill count increments (if
  scrolled)
- Bulk ack: select three rows → acknowledge → they show acknowledged and the stats count drops

---

## Definition of done

- [ ] Infinite, virtualised table smooth through 5,000+ rows
- [ ] Faceted filters and search in the URL; responsive typing under CPU throttle
- [ ] Live events inserted correctly with scroll anchoring and a "new events" pill
- [ ] Selection, bulk acknowledge (batched, optimistic), export CSV
- [ ] Reused on the robot Log tab
- [ ] Measurements recorded (DOM nodes and frame times, with and without virtualisation)

## Polish pass

- Row height fixed and dense; zebra or hover rows; keyboard focus ring per row
- Level badges are scannable; critical rows have a left accent bar
- Empty states for "no events match" (with a "clear filters" button) vs "no events at all"
- Copy event id/code on click with a toast

## Review questions

1. What does "headless" buy you, and what does it cost?
2. Why are filters part of the query key, and what happens to the cache when they change?
3. How do you insert a live event into an infinite query immutably?
4. What does `useTransition` change about how the update is rendered?
5. How did you keep the scroll position stable when rows were inserted above?

## Stretch

- Keyboard grid navigation (arrow keys between cells, `role="grid"` semantics).
- Saved views: name a filter combination and pin it to the sidebar.
- Group consecutive identical events ("Echo: heartbeat OK ×12").
