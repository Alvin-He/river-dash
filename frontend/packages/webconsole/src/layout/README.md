# Dashboard layout and interaction flow

The dashboard modules are movable panels. Geometry is **pixel-based**, relative
to the 1888 × 999 module surface (1920 × 1080 console, 48 px header, and
16 px canvas padding on each side). Module geometry must stay compatible with
`react-rnd`; do not change the coordinate system in a purely visual refactor.

## Ownership

| File | Responsibility |
| --- | --- |
| `../App.tsx` | App shell and the layout lock shared by header and canvas. |
| `../components/ConsoleHeader/` | Header markup and header-only styles. |
| `../components/DashboardCanvas/` | Registers the six visible modules and passes interaction callbacks into `FloatingModule`. |
| `useDashboardLayout.ts` | React state and interaction lifecycle; delegates geometry calculations to `dashboardLayout.ts`. |
| `dashboardLayout.ts` | Pure placement, snapping, pushing, resizing, minimum-size checks, and neighbor identification. |
| `../components/FloatingModule/` | `react-rnd` wrapper and the mouse drag/resize event adapters. |
| `../components/ModuleFrame/` | Shared module appearance; the affected-neighbor outline is a visual state, not a layout constraint. |

## Interaction lifecycle

1. **Drag:** `FloatingModule.onDrag` sends temporary geometry to
   `previewMove`; the hook uses `findMoveAffectedModules` to highlight snap
   anchors and displaced neighbors. No layout change is committed yet.
2. **Drag stop:** `onPositionChange` invokes `resolveModulePosition` to commit
   a snapped, valid layout; the preview is cleared.
3. **Resize start:** The hook stores the current layout, so it can later
   identify which **other** modules actually changed.
4. **Resize / stop:** `react-rnd` reports dimensions and the resize handle
   direction; `resizeWithNeighbors` updates the layout immediately. The
   existing engine can resize or push neighbors during growth; shrinking
   should leave neighbors alone. On stop, the stored snapshot is cleared.
5. **Layout lock:** The header toggles `isLocked`; the canvas forwards it to
   all wrappers, which disable both dragging and resizing.

## Existing layout rules

- 16 px separation between panels; no overlapping panels.
- 260 px minimum width and 150 px minimum height, except telemetry (190 px)
  and graphs (280 px).
- Header snap: 32 px. Top-edge module alignment: 12 px.