# Dashboard movement and resizing

The layout engine lives in `frontend/packages/webconsole/src/layout/dashboardLayout.ts`. `useDashboardLayout.ts` manages committed geometry, drag/resize previews, and browser-local persistence. `DashboardCanvas.tsx` connects that state to `FloatingModule`, which uses `react-rnd` for pointer interaction.

## Movement

- Modules snap to nearby compatible edges. Actual snap anchors and neighbors whose geometry changes are highlighted during drag preview.
- Dragging can push overlapping neighbors in the drag direction, including chains of multiple modules. The solver works on a draft layout and falls back to a free position if a push cannot be resolved.
- Narrow canvases allow vertical push chains to extend the scrollable surface rather than rejecting a move solely because the current scroll height is exhausted.

## Resizing

- Each module supports eight resize handles, with minimum widths and heights specified in `dashboardLayout.ts` and passed to `FloatingModule`.
- A growing module can shrink affected neighbors down to their minima or push them away. If the requested size cannot be accommodated, the engine limits the resize.
- Each resize uses a starting geometry snapshot so successive pointer updates do not accumulate changes to neighbors.

## Window sizing and persistence

- The reference workspace is `DEFAULT_SURFACE` (1888 × 999 CSS pixels), representing the content region of a nominal 1920 × 1080 dashboard.
- Smaller windows scale the saved geometry and then reflow modules if minimum sizes prevent the arrangement from fitting. The canvas can scroll.
- Completed drag/resize changes and Reset layout persist geometry in `localStorage` under `river-dash-layout-v1`; drag previews do not persist. Saved layouts also store a reference width so edited narrow-window layouts are not repeatedly scaled.

See [the layout README](./frontend/packages/webconsole/src/layout/README.md) for geometry invariants, module registration, and verification guidance.
