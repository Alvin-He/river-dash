# River Dash — Moving and Resizing Sweep (2026-10-28)

## Implemented

- Replaced the fixed-canvas, unbounded search and fragile neighbor-update code
  with pure, bounded, deterministic layout operations.
- Moving modules: near-edge snapping, transactional directional push chains,
  nearest available placement on blocked pushes, surface boundary clamping,
  and accurate neighbor highlighting without highlighting the active panel.
- Resizing modules: all eight handles, anchored opposite edges, live adjustment,
  shrink-first neighbor handling, chained push fallback, binary-search limit
  when blocked, module-specific minimum widths and heights, and no overlaps.
- Stabilized continuous resizing with a fixed layout snapshot captured at the
  start of each resize, rather than recomputing from already changed geometry.
- Added actual ResizeObserver-based canvas sizing, narrow-window reflow,
  vertically scrollable layouts, and a minimum usable canvas width.
- Added validated localStorage layout persistence, Reset layout recovery,
  and restoration of larger-window layouts after temporary responsive reflow.
- Preserved layout locking, telemetry/demo modules, and feature module APIs.

## Remaining broader product items (not part of this geometry sweep)

- Native pop-out windows and multi-layout workspace management.
- Module add/remove/minimize UI and keyboard shortcuts.
- Production control-mode behavior, real telemetry and control backends.
