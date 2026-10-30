# Dashboard dragging, resizing, and geometry

All geometry is in CSS pixels relative to the scrollable module surface.
`DashboardCanvas` measures the actual viewport width using `ResizeObserver`;
`DEFAULT_SURFACE` (1888 × 999) is the initial desktop geometry reference, not
a mandatory browser size.

## Ownership and lifecycle

1. `DashboardCanvas.tsx` registers each visible `FloatingModule`, supplies
   `positions[id]`, and connects drag/resize handlers to `useDashboardLayout`.
2. `FloatingModule.tsx` adapts `react-rnd` drag/resize events. Dragging starts
   on the `ModuleFrame` header (`drag-handle`), not the child body.
3. `useDashboardLayout.ts` owns committed geometry, drag previews, resize-start
   snapshots, live resizes, and persistence (`river-dash-layout-v1`).
4. `dashboardLayout.ts` provides pure bounded movement, snapping, collision
   pushes, resize geometry, minimum sizes, and narrow-window packing.
5. `ModuleFrame` renders the shared panel shell. The feature module is
   responsible for its own content layout and internal overflow.

During dragging, `findMoveAffectedModules()` marks neighbors that would
change and snap targets only when the snap is actually applied. During
resizing, `findChangedNeighborIds()` compares the baseline layout with the
live result. Highlighting stops after the interaction ends.

## Register a new module's geometry

The registration location is the `defaults` object near the top of
`dashboardLayout.ts`:

```ts
const defaults: DashboardLayout = {
  // Existing panel IDs and initial CSS pixel rectangles...
  // valves: { x: 0, y: 672, width: 340, height: 260 },
};
```

Add **one entry per new panel ID**, with `{ x, y, width, height }` chosen to
fit the desktop starting surface without colliding with existing panels.
`moduleIds` comes from `Object.keys(defaults)` automatically. There is no
additional registration switch or per-module function in this file.

If the feature needs another minimum size, add its ID to
`MIN_WIDTH_BY_MODULE` or `MIN_HEIGHT_BY_MODULE`. The default minimum is
260 × 150 px. Current exceptions include 420 × 280 px graphs, 300 px minimum
width for telemetry/P&ID/controls, and 190 px minimum height for telemetry.

In `DashboardCanvas.tsx`, import and wrap the feature in `FloatingModule`,
using the **same ID** for position, affected-highlight lookup, and every
layout callback. Pass the matching `minWidth={minWidthFor(id)}` and
`minHeight={minHeightFor(id)}` where needed; `FloatingModule` otherwise
uses its own 260 × 150 px defaults.

**CSS minimums are not geometry constraints.** A child element's CSS
`min-width`/`min-height` can overflow or be clipped without stopping a resize.
Only the layout-engine limits and `FloatingModule` props restrict panel size.
There is no module-owned maximum or dynamically updated minimum API yet;
available surface and collision handling constrain maximum growth.

**Persistence caveat:** The current saved-layout validator requires all IDs
in `moduleIds`. Adding a panel makes saved layouts without that ID invalid,
which causes a default-layout fallback; adding migrations would be separate
work.

## Geometry invariants

1. Panels stay within available bounds and maintain at least 16 px separation.
2. Both the engine and `react-rnd` must enforce compatible minimum sizes.
3. The edge opposite a resize handle remains anchored. Growing may shrink
   neighbors to their minimums and/or push them away.
4. A failed operation does not commit a partially updated neighbor chain.
5. Continuous resize calculations use the snapshot captured at resize start.
6. Narrow windows repack panels into vertically scrollable rows. The surface
   has a 420 px minimum width, so extremely narrow areas may scroll horizontally.
7. Responsive packing does not overwrite a saved wider layout unless the user
   explicitly commits a change in the packed layout.
8. Only committed layouts are persisted in `localStorage`, checked on load;
   Reset layout restores defaults when editing is unlocked.

## Validation for the MVP

The automated layout test file and `test:layout` npm script are intentionally
absent for now. Their removal does not verify the interactions.

From the webconsole workspace, run `npm run build` and `npm run lint` after
installing dependencies. Manually exercise each resize handle, snapping and
glow, crowded pushes, lock mode, window narrowing, scrolling, reload/restore,
and Reset layout before merging.

For a complete feature example and CSS ownership table, see
[`MODULE_DEVELOPER_GUIDE.md`](../../../../../MODULE_DEVELOPER_GUIDE.md).
