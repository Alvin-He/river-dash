# Modules

This directory contains feature-specific dashboard modules. Each module has its
own folder and composes reusable components from `../components` rather than
implementing drag/resize behavior or duplicating the standard visual shell.

## Current modules

- `telemetry/TelemetryModule.tsx` — raw telemetry display with an internal
  scrollable table, a **Channels** popover (per-channel show/hide, Show all,
  Hide all), browser-local persistence, and a replaceable `TelemetryStream`
  subscription adapter. Selections also travel with newly saved named layouts.
  Its temporary data source is in `telemetry/demoTelemetryStream.ts`. See
  [Telemetry controls](../../../../../TELEMETRY_CHANNELS.md) for details.
- `time-series-graph/TimeSeriesGraphModule.tsx` — container-responsive graph
  with manual X/Y ranges, vertical wheel/drag panning, zoom, measurement
  selection, per-trace colors/styles, and saved-view persistence. See
  [Graph controls](../../../../../GRAPH_CONTROLS.md) for operator behavior and
  warnings about the demo stream and mixed units.
- `placeholder/PlaceholderModule.tsx` — **temporary content**, used where a
  real feature is not implemented yet. It is a minimal `ModuleFrame` example,
  not the recommended full-feature implementation guide.

Graph and telemetry modules may now be added repeatedly from the floating
menu. Each instance has a stable ID and its own saved channel/axis settings,
and both types can be removed without touching fixed operational panels.
Module counts and membership are preserved in the active and named layouts.

## Adding a new fixed module type

1. Create a feature folder (`valve-control/`) with a React component, an optional
   `*.module.css`, and an optional `index.ts` export.
2. Render the content inside `ModuleFrame`, supplying a `title`. The module
   itself does **not** create a `FloatingModule` or implement drag/resize logic.
3. In `../layout/dashboardLayout.ts`, add a unique ID and initial `{ x, y,
width, height }` entry in `defaults`. `moduleIds` is generated from that
   object automatically. Add an entry in `MIN_WIDTH_BY_MODULE` and/or
   `MIN_HEIGHT_BY_MODULE` only if the defaults (260 × 150 px) are insufficient.
4. In `../components/DashboardCanvas/DashboardCanvas.tsx`, import and wrap the
   feature in `FloatingModule`. Use that same ID for `positions[id]`, every
   layout-hook callback (`updatePosition`, `updateResize`, `previewMove`,
   `beginResize`) and `affectedModuleIds.has(id)`. Pass matching minimum sizes
   to `FloatingModule` so its drag UI and the geometry engine agree.
5. Forward `isAffected` from the canvas to the feature, then pass
   `className={isAffected ? "affected-module" : ""}` to its `ModuleFrame` if
   the feature should use the shared neighbor/snap-target glow.
6. Verify that the content remains usable at its configured minimum and add
   a short module description above.

### Child layout requirements

`ModuleFrame` owns the border/header and renders its children in a padded,
`display: flex`, `flex: 1`, `overflow: hidden` content region. Children do **not**
have to be flex boxes and are **not** required to implement resizing. They must
adapt to the space: `flex: 1`, `min-width: 0`, and `min-height: 0` are useful
for flexible children, and any list/table needing scrollbars should set its
**own** `overflow: auto`.

A child CSS `min-width` or `min-height` does **not** change the dashboard's
geometry constraints. Set geometry limits in `dashboardLayout.ts` and keep
`FloatingModule` minimums consistent. There is no feature-level maximum-size
or dynamic-resize API at present.

For exact file paths, a full JSX registration example, API details, styling
ownership, and saved-layout caveats, see the repository's
[`MODULE_DEVELOPER_GUIDE.md`](../../../../../MODULE_DEVELOPER_GUIDE.md).
