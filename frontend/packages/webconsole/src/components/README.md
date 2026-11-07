# Shared components

Reusable dashboard components provide a shared shell and interaction surface;
feature modules in `../modules/` supply domain content and its internal styling.

## Responsibilities

- `ConsoleHeader` — dashboard-level lock, reset, and sign-out controls.
- `DashboardCanvas` — viewport measurement, registration of visible panels,
  layout-hook wiring, and scrollable canvas. It does not implement geometry math.
- `FloatingModule` — `react-rnd` positioning and all eight resize handles;
  forwards preview/commit events to the layout hook. It is the **movable and
  resizable wrapper**, not the feature content itself.
- `ModuleFrame` — shared panel appearance, header/drag grip, status label,
  optional actions and affected-neighbor glow. It **does not** implement
  dragging, resizing, snapping or persistence.

## `ModuleFrame` public interface

| Prop | Required | Description |
| --- | --- | --- |
| `title: string` | Yes | Standard header text; header is the drag grip. |
| `children: ReactNode` | Yes | Feature content inside the padded body. |
| `status?: "live" \| "idle" \| "warning" \| "error"` | No | Status color; defaults to `idle`. |
| `statusLabel?: string` | No | Optional visible status label (no label means no status indicator). |
| `actions?: ReactNode` | No | Optional header controls. |
| `className?: string` | No | Extra class on the outer panel, including `affected-module`. |

The child content wrapper is `display: flex; flex: 1; min-height: 0;
overflow: hidden; padding: 8px`. Children may use flex, grid, SVG, or other
layouts; they don't have to be independently resizable. Feature authors should
make children shrink responsibly and own internal scroll regions. The frame
will clip content that exceeds the space available.

Feature modules receive no special context, dimension callback, or runtime
min/max-size setter from `ModuleFrame`. The currently implemented glow pattern
passes `isAffected` from `DashboardCanvas` to each feature, which supplies the
class `affected-module` to `ModuleFrame`. During a move, glow marks changed
neighbors and valid snap anchors; during resize, it marks changed neighbors.
Nearby panels that neither participate in a snap nor change geometry should
remain unlit.

## Styling ownership

- Shared theme tokens / global defaults: `../styles/tokens.css` and global CSS.
- Canvas sizing and scrolling: `DashboardCanvas.module.css`.
- `react-rnd` geometry and resize handles: `FloatingModule`.
- Common title, status, padding, border and glow: `ModuleFrame.module.css`
  and `ModuleFrame.effects.css`.
- Feature-specific layout, data styling and scroll regions: each feature's
  CSS Module. Do not set absolute canvas coordinates inside a feature module.

Interactive controls in the header (buttons/inputs) are excluded from drag;
use `[data-no-drag]` for other areas that must not begin dragging.

See `../layout/README.md` for the geometry lifecycle and
[`MODULE_DEVELOPER_GUIDE.md`](../../../../../MODULE_DEVELOPER_GUIDE.md) for
an end-to-end registration example.
