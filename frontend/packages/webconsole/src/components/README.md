# Components

This directory contains reusable React components shared across dashboard modules.

## Items

- `ModuleFrame` — shared, draggable header and resizable-panel visual shell for
  dashboard modules.
- `FloatingModule` — free-positioned wrapper with eight-direction (N, NE, E,
  SE, S, SW, W, NW) resizing, neighbor-edge alignment, snapping to the
  console header when within 32px, top-edge alignment to other modules within
  12px (even across separate columns), and live shared-divider resizing with
  adjacent modules. The layout engine enforces minimum sizes and surface
  boundaries; crowded resizes stop at the last valid geometry rather than
  reverting the entire adjustment.
- During a drag, affected or snap-anchor modules glow rather than the dragged
  module. During resizing, the glow follows neighboring modules whose
  position or size changes; it disappears when the interaction ends.
