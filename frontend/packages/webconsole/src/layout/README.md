# Dashboard dragging, resizing, and geometry

All geometry is in CSS pixels relative to the scrollable module surface.
`DashboardCanvas` measures the actual viewport width using `ResizeObserver`.
`DEFAULT_SURFACE` (1888 × 1048) represents the content area of a default
**1920 × 1080 (16:9)** dashboard with no top bar and 16px canvas padding.
It is a geometry reference, not a fixed browser aspect ratio: the dashboard
always fills the available window. Smaller windows proportionally resize the
module rectangles while preserving their relative arrangement, restoring gaps
and respecting minimum sizes. If they cannot fit, modules reflow into scrollable
rows; no CSS zoom or transform changes pointer coordinates.

## Ownership and lifecycle

1. `DashboardCanvas.tsx` registers each visible `FloatingModule`, supplies
   `positions[id]`, and connects drag/resize handlers to `useDashboardLayout`.
2. `FloatingModule.tsx` adapts `react-rnd` drag/resize events. Dragging starts
   on the `ModuleFrame` header (`drag-handle`), not the child body.
3. `useDashboardLayout.ts` owns committed geometry, drag previews, resize-start
   snapshots, live resizes, and active-layout autosave (`river-dash-layout-v1`).
   It exposes `getLayoutSnapshot` and `applyLayoutSnapshot` through the canvas
   ref so named layouts can be loaded without altering resize/collision rules.
4. `layoutConfigurations.ts` validates and stores named configurations under
   `river-dash-layout-configurations-v1`, separate from the active autosave.
   It also handles versioned single-layout JSON import/export.
5. `dashboardLayout.ts` provides pure bounded movement, snapping, collision
   pushes, resize geometry, minimum sizes, and narrow-window packing.
6. `ModuleFrame` renders the shared panel shell. The feature module is
   responsible for its own content layout and internal overflow.

During dragging, `findMoveAffectedModules()` marks neighbors that would
change and snap targets only when the snap is actually applied. During
resizing, `findChangedNeighborIds()` compares the baseline layout with the
live result. Highlighting stops after the interaction ends.

## Creating and removing panels

Open the floating menu using **Shift+M**, unlock the layout, and use the
**Modules** group to add Time series graph or Telemetry overview panels. The
same group lists current instances and offers a Remove action; an unlocked
panel also shows a remove button in its header. At most eight panels of each
kind may exist. These two panel types are the only removable ones: Propellant
pressures, P&ID, Mode & Valve Control and Operator event log are fixed.

Added panels have stable IDs (`graphs`, `graphs-1`, etc.; `telemetry`,
`telemetry-1`, etc.). Their positions and sizes are independent, and their
settings are keyed by instance ID, rather than shared between copies. Removing
and re-adding an ID starts that panel with default settings; a named layout
saved beforehand can restore the former arrangement and settings. Removing all
instances of either type is allowed; add the type again from the menu.

The layout hook autosaves the active **set of panels and their geometry** in
`river-dash-layout-v1`. Narrow-window packing dynamically iterates the present
IDs and never rewrites the desktop arrangement on resize alone. The module
registry and input validation are in `dashboardLayout.ts`. Only the graph and
telemetry families are dynamically extensible. To register an entirely new,
fixed feature type, provide its default geometry and render it in the canvas;
update the fixed-ID allowlist and saved-layout schema accordingly.

**CSS minimums are not geometry constraints.** The engine and `FloatingModule`
share minimum sizes; adding a minimum CSS width alone does not restrict a
resize. The canvas may scroll vertically when added modules cannot fit.

## Geometry invariants

1. Panels stay within available bounds and maintain at least 16 px separation.
2. Both the engine and `react-rnd` must enforce compatible minimum sizes.
3. The edge opposite a resize handle remains anchored. Growing may shrink
   neighbors to their minimums and/or push them away.
4. A failed operation does not commit a partially updated neighbor chain.
5. Continuous resize calculations use the snapshot captured at resize start.
6. Narrow windows first resize panels proportionally (subject to their minimum
   sizes), then repack into vertically scrollable rows if needed. The surface
   has a 420 px minimum width, so extremely narrow areas may scroll horizontally.
7. Responsive scaling/packing does not overwrite a saved wider layout unless
   the user commits an edit. The saved `referenceWidth` records the editing
   viewport so committed narrow layouts are not scaled again on the next render
   or when reloaded; older saved layouts without it use the desktop reference.
8. Only committed layouts are persisted in `localStorage`, checked on load;
   Reset layout restores defaults when editing is unlocked.

## Named layout configurations

Open the floating menu (`Shift+M`) and use **Saved layouts** to save a name,
load an existing configuration, export it as a JSON file, import JSON, or delete
an unwanted configuration. Deletions ask for confirmation; duplicate names
(case-insensitive) are rejected. Loading requires layout editing to be unlocked,
while saving an existing arrangement or importing a preset is allowed when
locked. The **Reset layout** command changes only the active geometry, not
named configurations.

Saved configurations contain the current set of fixed plus graph/telemetry
module IDs, CSS-pixel geometry, reference width, and per-instance graph and
telemetry settings. Existing geometry-only configurations remain compatible.
Configurations do not store real-time data, login state or menu-button settings.
The configurations live in this browser's `localStorage`; use Export/Import JSON
to move them between browsers. A maximum of 30 named layouts is supported.

Loading validates required fixed modules, limits repeated modules to eight per
type, rejects unknown IDs, checks all rectangles and denies overlapping or
out-of-bounds geometry. It also validates settings IDs and applies settings
after newly added components have mounted. Responsive packing stays separate
from committed geometry, allowing configurations to be loaded on narrow screens
without overwriting desktop positions until edited.

## Validation for the MVP

`dynamicModules.test.ts` tests adding, removing, narrow packing, validation,
and named-layout round-tripping. `layoutConfigurations.test.ts` contains tests for parsing, persistence,
name collisions, JSON round-trip, size limits, and responsive preservation.
Run `npx vitest run packages/webconsole/src/layout/layoutConfigurations.test.ts`
from `frontend/` after installing dependencies on your machine. Manual browser
verification remains necessary for drag/resize and menu interactions.

From the webconsole workspace, run `npm run build` and `npm run lint` after
installing dependencies. Manually exercise each resize handle, snapping and
glow, crowded pushes, lock mode, window narrowing, scrolling, reload/restore,
and Reset layout before merging.

For a complete feature example and CSS ownership table, see
[`MODULE_DEVELOPER_GUIDE.md`](../../../../../MODULE_DEVELOPER_GUIDE.md).
