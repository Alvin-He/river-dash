# Time-series graph controls (front-end-ui-modules)

The graph uses **simulated numeric telemetry** until connected to the real data bridge. Its status is deliberately **Demo**, not verified live telemetry. Existing draggable/resizable dashboard behavior is unchanged.

## Configure graph axes

In the graph module, select **Settings**:

- **Time window** — enter any integer from **5 to 3600 seconds**, default 60 seconds. Data outside the selected interval are not displayed.
- **End offset** — how many seconds back from the newest sample the right edge lies; default 0. Increase it to inspect older history. The visible left edge is `newest sample - end offset - time window`.
- **X tick interval** — seconds between X-axis labels; blank means automatic. To prevent collisions, intervals smaller than roughly one twelfth of the visible window are visually thinned.
- **Pause X-axis / Resume live X-axis** — freeze or resume the time anchor. Pausing does not stop telemetry collection; the stream continues recording until its bounded buffer fills.
- **Y minimum / maximum** — enter finite values where minimum is smaller than maximum, then select **Apply limits**. This intentionally allows excluding zero while manually inspecting a region.
- **Auto-fit Y** — recalculates the Y-axis from the measurements inside the visible time window, always including a zero baseline.
- **Reset view** — restore the default 60-second following window, zero X offset, automatic tick spacing and Y auto-fit. This does not overwrite selected measurements or trace styles.

The graph uses the newest **source sample timestamp**, not the browser clock, for its time axis. X labels indicate seconds relative to that newest sample. The demo stream keeps approximately one hour of 1 Hz samples in memory; actual backend retention depends on the future streaming adapter. Panning beyond available history shows an empty graph rather than fabricating measurements.

## Pan, scroll, zoom

| Action | Behavior |
|---|---|
| Mouse wheel over graph | **Vertically scroll/pan** the Y-axis |
| Drag vertically on plot | Pan the Y-axis following pointer movement |
| Shift + wheel | Pan the time window earlier/later |
| Ctrl/Cmd + wheel | Zoom the Y-axis |
| Alt + wheel | Zoom the X-axis |
| Focus plot and press Up/Down | Pan vertically |
| Focus plot and press Left/Right | Pan in time |
| Focus plot and press + / − | Zoom the Y-axis |
| Quick ← → + − buttons | Pan/zoom time window |
| Settings → Pan / Zoom buttons | Y-axis pan and zoom with no wheel required |

Scroll behavior only captures gestures over the **plot surface**. The module remains movable using its header and resizable using the existing handles when dashboard editing is unlocked. The graph settings panel has its own scrollbar and doesn't resize neighboring modules.

## Measurements and trace appearance

Every numeric channel from the supplied `GraphDataStream` is shown in **Measurements & traces**. Toggle a channel's checkbox, choose a color with the color picker, and select **Solid**, **Dashed**, **Dotted**, or **Dash-dot**. The legend displays each channel's name and unit, with a matching colored and styled swatch.

Selected channels currently share a **single Y-axis**. A `MIXED UNITS` warning appears when the selection spans incompatible measurement units, such as psi and kg. Hide unwanted units to get a meaningful shared scale; independent multi-unit axes are not implemented.

## Persistence and saved layouts

- Live graph preferences save automatically in browser `localStorage` under `river-dash-time-series-graph-v1`, independent of the dashboard's active geometry autosave.
- **New named layouts** saved through the floating console menu also capture the current graph preferences. Loading or importing those layouts restores axis range, window/offset, measurement selection, colors and line styles alongside geometry.
- Existing saved-layout JSON files without graph preferences remain valid. Loading them changes geometry only and leaves the current graph configuration in place.
- Exported named layout JSON now includes an optional `graphSettings` object; the file format remains `river-dash-layout` version 1 for backward compatibility.
- The pause/live state itself is not persisted: loading a saved configuration always resumes the X-axis relative to the current newest sample.

## Files

- `frontend/packages/webconsole/src/modules/time-series-graph/TimeSeriesGraphModule.tsx` — UI controls, settings state, chart integration.
- `GraphPlot.tsx` — responsive SVG graph, wheel/drag/keyboard handlers.
- `graphMath.ts` — viewport filtering, axis ticks, zoom, pan, line types.
- `graphSettings.ts` — persistence, input validation and channel defaults.
- `demoGraphStream.ts` — up to one hour of synthetic 1 Hz history.
- `frontend/packages/webconsole/src/layout/layoutConfigurations.ts` — optional graph settings in portable named layouts.

## Verification instructions

From `frontend/` after a fresh `npm install`:

```sh
npx tsc --noEmit -p packages/webconsole/tsconfig.app.json
npm run lint -w webconsole
npx vitest run packages/webconsole/src/modules/time-series-graph/graphMath.test.ts packages/webconsole/src/modules/time-series-graph/graphSettings.test.ts packages/webconsole/src/layout/layoutConfigurations.test.ts
npm run build -w webconsole
```

Browser checks: change the window; inspect 100–120 seconds ago; pause X while the stream continues; scroll and drag Y, then auto-fit; test zoom in/out on both axes; toggle and style individual channels; export/import a named layout; reload; and verify a 300px-wide graph panel still exposes Settings.
