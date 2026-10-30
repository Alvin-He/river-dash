# River Dash — Dashboard module developer guide

This guide documents the current webconsole module architecture: how to add a module, what `ModuleFrame` expects, how geometry and sizing work, styling ownership, placeholder modules, and graph tick intervals.

Relevant source root: `frontend/packages/webconsole/src/`.

## 1. How the dashboard fits together

```text
App.tsx (dashboard route, edit lock/reset state)
  ├─ ConsoleHeader (lock/reset/sign-out controls)
  └─ DashboardCanvas (visible module registration, measures viewport)
       ├─ useDashboardLayout (committed/live/preview geometry, persistence)
       │    └─ dashboardLayout.ts (pure collision/snap/resize/fit helpers)
       └─ FloatingModule (react-rnd: drag/resize events, x/y/width/height)
            └─ Feature module (domain content; e.g., TelemetryModule)
                 └─ ModuleFrame (visual shell, header/drag grip, status, actions, glow class)
                      └─ Feature content (layout, scrolling, data rendering)
```

`ModuleFrame` is not the movable/resizable element. `FloatingModule` wraps each feature module and owns `react-rnd`. `ModuleFrame` provides a standard appearance and a header marked with the `drag-handle` class. `FloatingModule` tells `react-rnd` to drag by that class, and prevents drag initiation on buttons, inputs, selects, textareas, and `[data-no-drag]` elements.

The layout hook, not the individual feature module, determines geometry, affected-neighbor highlights, save/restore, and reset. The geometry implementation is in `src/layout/dashboardLayout.ts`.

## 2. Add a module: concrete steps

Example name: `ValveControlModule`, with layout ID `valves` (the ID must be unique and consistent).

1. Add `src/modules/valve-control/ValveControlModule.tsx` and an optional CSS Module; export the component from `src/modules/valve-control/index.ts`.
2. Render feature content inside `ModuleFrame`. The feature module does **not** create a `FloatingModule`, handle drag events, or calculate its own panel x/y/width/height.
3. Add a default geometry entry to the `defaults` object near the top of `src/layout/dashboardLayout.ts`:

   ```ts
   valves: { x: 0, y: 672, width: 340, height: 260 },
   ```

   These values are **illustrative only**. Choose initial coordinates that do not overlap existing modules and that fit the intended desktop surface. `moduleIds` is derived automatically from `Object.keys(defaults)`; do not add a separate ID list.
4. If needed, specify `valves` in `MIN_WIDTH_BY_MODULE` and/or `MIN_HEIGHT_BY_MODULE` in the same file. Otherwise, default geometry minima are 260 px wide and 150 px tall. Do not set a minimum larger than the 420 px minimum narrow-screen canvas without revisiting responsive behavior.
5. In `src/components/DashboardCanvas/DashboardCanvas.tsx`, import the new module and add a `FloatingModule` alongside existing registrations. **All** its interaction callbacks use the same layout ID and the same central hook instance. A typical registration (showing the existing wiring) looks like:

   ```tsx
   <FloatingModule
     position={positions.valves}
     minWidth={minWidthFor("valves")}
     minHeight={minHeightFor("valves")}
     isLocked={isLocked}
     onPositionChange={updatePosition("valves")}
     onResize={updateResize("valves")}
     onDragPreview={previewMove("valves")}
     onDragEnd={clearDragPreview}
     onResizeStart={beginResize("valves")}
     onResizeEnd={endResize}
   >
     <ValveControlModule isAffected={affectedModuleIds.has("valves")} />
   </FloatingModule>
   ```

   Import `minHeightFor` from `layout/dashboardLayout.ts` if you choose to pass it explicitly. Existing entries sometimes omit `minHeight`, in which case `FloatingModule` uses its default 150 px; keeping the wrapper minimum and geometry-engine minimum in sync is recommended.
6. Add an entry to `src/modules/README.md` identifying the new feature and its data source.
7. Manually check that the starting geometry is valid, that the content remains usable at its specified minimum, that controls in the header don't initiate dragging, and that the panel remains recoverable on narrow screens.

**Persistence caveat:** `parseSavedLayout()` currently requires geometry for every ID in `moduleIds`. Introducing an ID invalidates older saved layouts that lack it, so those layouts fall back to defaults. If preserving customized layouts across additions becomes important, introduce an explicit storage migration rather than assuming old saves survive.

## 3. `ModuleFrame` contract

Source: `src/components/ModuleFrame/ModuleFrame.tsx`.

| Prop | Required? | Meaning |
| --- | --- | --- |
| `children: ReactNode` | Yes | Feature content rendered inside the padded `.content` element. |
| `title: string` | Yes | Text in the standard, draggable module header. |
| `status?: "live" \| "idle" \| "warning" \| "error"` | No | Color category used **only when** `statusLabel` is supplied; default `idle`. |
| `statusLabel?: string` | No | Optional status text shown in the header. |
| `actions?: ReactNode` | No | Optional header controls (buttons, etc.). |
| `className?: string` | No | Additional CSS class on the outer `<section>`; used for the affected glow. |

**Children do not have to be flex containers or independently resizable.** `ModuleFrame`'s outer element is a 100%-height column flex container. Its content wrapper is `display: flex; flex: 1; min-height: 0; overflow: hidden; padding: 8px`. Children must fit the space made available, usually by using their own flex/grid layout with `min-width: 0` / `min-height: 0` where appropriate. For a feature needing a scrollable list or table, make that feature's internal region scrollable (`overflow: auto`), because the shared content wrapper clips overflow rather than scrolling it.

Example feature implementation:

```tsx
import { ModuleFrame } from "../../components/ModuleFrame";
import styles from "./ValveControlModule.module.css";

export function ValveControlModule({ isAffected = false }: { isAffected?: boolean }) {
  return (
    <ModuleFrame
      title="Valve controls"
      className={isAffected ? "affected-module" : ""}
    >
      <div className={styles.content}>Control UI goes here</div>
    </ModuleFrame>
  );
}
```

```css
/* Example feature-owned inner layout, not a required ModuleFrame child type. */
.content {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
```

`isAffected` is **not** a prop of `ModuleFrame` and is **not** automatically injected into feature modules. Current modules receive `isAffected` from `DashboardCanvas` and translate it into `className="affected-module"` on the frame. The global rule for that class is in `ModuleFrame.effects.css`. Do not add the glow class unconditionally: the layout hook computes which neighbors/snap anchors should glow; the active dragged module is not highlighted by that mechanism.

## 4. Module APIs, data, and sizing

### API available to a feature module

There is **no dedicated layout context or resize API** exposed by `ModuleFrame` to its children. The public `ModuleFrame` surface is the props table above. `FloatingModule` receives callbacks from `useDashboardLayout` via `DashboardCanvas`; feature components don't currently receive those callbacks, panel dimensions, resize direction, or a `setMinSize` function.

Feature modules can use normal React props/hooks and their own data adapters. For example, `TelemetryModule` accepts a readings array or stream object with `subscribe`, and the graph module accepts series or stream data. Those data contracts belong to each feature; they are not supplied by `ModuleFrame`.

### Where constraints actually live

- `dashboardLayout.ts`: `MIN_WIDTH`, `MIN_HEIGHT`, the per-ID maps `MIN_WIDTH_BY_MODULE` / `MIN_HEIGHT_BY_MODULE`, and exported `minWidthFor(id)` / `minHeightFor(id)` enforce **geometry-engine minimums**.
- `DashboardCanvas.tsx`: passes module minimum widths and some minimum heights into the relevant `FloatingModule` instances.
- `FloatingModule.tsx`: passes `minWidth` / `minHeight` to `react-rnd`; default props are 260 px and 150 px.
- `ModuleFrame.module.css` and feature CSS: determine only **internal presentation and overflow**, not the geometry engine's allowed bounds.

There is currently **no module-specific maximum-size API**. Resizes are limited by the available surface, opposite-edge anchoring, collision rules, and any surrounding modules. Adding `min-width` / `min-height` in child CSS does **not** update the geometry engine or `react-rnd` minimums, so the child may overflow or be clipped even while the module is still considered a valid size.

Make constraints consistent in both places (layout engine + `FloatingModule`). Keep hard minimums as small as the module can use without hiding essential operator controls or status information.

## 5. CSS and behavioral responsibility boundaries

| Owner | Responsibility | Avoid putting here |
| --- | --- | --- |
| `src/styles/tokens.css` and console/global styles | Shared color tokens, typography, resets and dashboard defaults | Module-specific widget layouts |
| `DashboardCanvas.module.css` | Scrolling canvas and relative module surface | Feature content or per-module border designs |
| `FloatingModule.tsx` / `.css` | Absolute positioning, draggable handles, panel size constraints and event bridging | Telemetry or domain controls |
| `ModuleFrame.module.css` / `.effects.css` | Consistent shell, title bar, drag handle, status and glow | Per-feature scrolling or data formatting |
| Feature `*.module.css` | Internal flex/grid structure, scroll regions, responsive content and feature-specific visuals | Absolute canvas positioning or global drag handles |
| `dashboardLayout.ts` | Pixel geometry, snapping, collisions, bounds and minimum-size rules | React state, CSS and data fetching |
| `useDashboardLayout.ts` | Interaction preview/commit, browser-local layout persistence | Feature UI rendering |

For action controls inside a header, use standard interactive elements (already exempted from drag) and the `[data-no-drag]` marker where appropriate. Keep module content presentation responsive to container size rather than viewport assumptions.

**Drag/glow behavior:** During a move preview, `findMoveAffectedModules` calculates changed neighbors and an actual snap anchor when the snap is applied. Merely being nearby does not cause a glow. During resize, `findChangedNeighborIds` compares the starting geometry with live geometry. `DashboardCanvas` passes each module's membership in `affectedModuleIds` to the feature module.

**Save behavior:** A successful drag or resize completion persists the committed layout under `river-dash-layout-v1` in `localStorage`. Preview-only positions are not persisted. The default full dashboard uses a 1920 × 1080 (16:9) reference; narrower viewports proportionally shrink module geometry before reflow is necessary. This viewport-derived scaling/packing does not overwrite the wider committed layout unless an interaction is committed there. Committed narrow-window edits save their reference width to prevent repeated scaling after reload.

## 6. What `PlaceholderModule` is for

`src/modules/placeholder/PlaceholderModule.tsx` is **temporary UI content** for modules that have not been implemented (currently used for pressure, P&ID, controls, and events in `DashboardCanvas`). It happens to show the bare minimum `ModuleFrame` usage and affected-glow forwarding, but it is **not intended to be the complete integration example**. Use `TelemetryModule` for scrollable data content and `TimeSeriesGraphModule` for a resize-sensitive visual component.

## 7. What is a "nice interval"?

`getNiceInterval(rawInterval)` is a private helper in `src/modules/time-series-graph/graphMath.ts` (not a React component, public API or type). It rounds the desired **Y-axis tick interval upward** to a readable step. The preferred normalized steps are `1, 2, 2.5, 5, 10` times a power of ten. For example, a desired interval of 3.7 becomes 5; a desired interval of 0.13 becomes 0.2. `getGraphScale()` uses that result to produce legible Y-axis tick positions that include zero and cover the visible data range. Time-axis tick selection uses the separate `getTimeInterval()` helper.

## 8. Current limitations and manual review

- Module registration remains centralized; there is no runtime add/remove API yet.
- Geometry limits are configured centrally, not per-module dynamically.
- Saved layouts use a fixed version and currently fall back to defaults when new modules are added.
- The layout's narrow-screen minimum width is 420 px, so very narrow browser areas can scroll horizontally as well as vertically.
- There are currently no automated layout tests or `test:layout` script. After installing dependencies, use `npm run build` and `npm run lint` in the webconsole workspace and manually check dragging, snapping/glow, resize handles, locking, split-screen, persistence, and reset.

See also `src/modules/README.md`, `src/components/README.md`, `src/layout/README.md`, and `MOVING_RESIZING_SWEEP.md`.
