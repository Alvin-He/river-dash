import type { ModulePosition } from "../components/FloatingModule";

/** Geometry is in CSS pixels relative to the actual scrollable module surface. */
export const MODULE_GAP = 16;
export const MIN_WIDTH = 260;
export const MIN_SURFACE_WIDTH = 420;
const MIN_WIDTH_BY_MODULE: Record<string, number> = { telemetry: 300, controls: 300, pid: 300, graphs: 420 };
export const DEFAULT_SURFACE = { width: 1888, height: 999 };
const MIN_HEIGHT = 150;
const MIN_HEIGHT_BY_MODULE: Record<string, number> = { telemetry: 190, graphs: 280 };
const SNAP_DISTANCE = 32;
const ALIGN_DISTANCE = 12;

export type DashboardLayout = Record<string, ModulePosition>;
export type SurfaceBounds = { width: number; height: number };
export interface SnapTarget { moduleId: string }

const defaults: DashboardLayout = {
  pressure: { x: 0, y: 0, width: 340, height: 260 },
  telemetry: { x: 356, y: 0, width: 350, height: 340 },
  pid: { x: 356, y: 356, width: 350, height: 250 },
  controls: { x: 722, y: 0, width: 350, height: 410 },
  events: { x: 722, y: 426, width: 350, height: 220 },
  graphs: { x: 1088, y: 0, width: 560, height: 420 },
};

export const moduleIds = Object.keys(defaults);
export function minHeightFor(id: string): number { return MIN_HEIGHT_BY_MODULE[id] ?? MIN_HEIGHT; }
export function minWidthFor(id: string): number { return MIN_WIDTH_BY_MODULE[id] ?? MIN_WIDTH; }
const copy = (layout: DashboardLayout): DashboardLayout =>
  Object.fromEntries(Object.entries(layout).map(([id, geometry]) => [id, { ...geometry }]));
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
const close = (a: ModulePosition, b: ModulePosition) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

export function createInitialLayout(): DashboardLayout { return copy(defaults); }

export function insideSurface(p: ModulePosition, bounds: SurfaceBounds = DEFAULT_SURFACE): boolean {
  return Object.values(p).every(Number.isFinite) && p.x >= 0 && p.y >= 0 &&
    p.x + p.width <= bounds.width + 0.001 && p.y + p.height <= bounds.height + 0.001;
}
export function overlapsWithGap(a: ModulePosition, b: ModulePosition): boolean {
  return a.x < b.x + b.width + MODULE_GAP && a.x + a.width + MODULE_GAP > b.x &&
    a.y < b.y + b.height + MODULE_GAP && a.y + a.height + MODULE_GAP > b.y;
}
export function layoutIsValid(layout: DashboardLayout, bounds: SurfaceBounds = DEFAULT_SURFACE): boolean {
  const entries = Object.entries(layout);
  return entries.every(([id, p]) => insideSurface(p, bounds) && p.width >= minWidthFor(id) && p.height >= minHeightFor(id)) &&
    entries.every(([, a], index) => entries.slice(index + 1).every(([, b]) => !overlapsWithGap(a, b)));
}

function clampMove(p: ModulePosition, id: string, bounds: SurfaceBounds): ModulePosition {
  const width = clamp(p.width, minWidthFor(id), bounds.width);
  const height = clamp(p.height, minHeightFor(id), bounds.height);
  return { x: clamp(p.x, 0, bounds.width - width), y: clamp(p.y, 0, bounds.height - height), width, height };
}
const distance = (a: ModulePosition, b: ModulePosition) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Snap only to *nearby* edges; a distant module must never attract a drag. */
function getSnapResult(id: string, p: ModulePosition, current: DashboardLayout, bounds: SurfaceBounds) {
  const choices: { target: string; p: ModulePosition; score: number }[] = [];
  const offer = (target: string, x: number, y: number, thresholdX: number, thresholdY: number) => {
    if ((p.x === x && p.y === y) || Math.abs(p.x - x) > thresholdX || Math.abs(p.y - y) > thresholdY) return;
    const next = { ...p, x, y };
    if (insideSurface(next, bounds)) choices.push({ target, p: next, score: distance(next, p) });
  };
  Object.entries(current).forEach(([otherId, other]) => {
    if (otherId === id) return;
    // Adjacent (left/right, above/below); align to both leading edges or preserve the other axis.
    const left = other.x - p.width - MODULE_GAP;
    const right = other.x + other.width + MODULE_GAP;
    const above = other.y - p.height - MODULE_GAP;
    const below = other.y + other.height + MODULE_GAP;
    offer(otherId, left, other.y, SNAP_DISTANCE, 64);
    offer(otherId, right, other.y, SNAP_DISTANCE, 64);
    offer(otherId, other.x, above, 64, SNAP_DISTANCE);
    offer(otherId, other.x, below, 64, SNAP_DISTANCE);
    // Single-axis edge snaps must share an edge span, not just one coordinate.
    if (p.y < other.y + other.height && p.y + p.height > other.y) {
      offer(otherId, left, p.y, SNAP_DISTANCE, 0);
      offer(otherId, right, p.y, SNAP_DISTANCE, 0);
    }
    if (p.x < other.x + other.width && p.x + p.width > other.x) {
      offer(otherId, p.x, above, 0, SNAP_DISTANCE);
      offer(otherId, p.x, below, 0, SNAP_DISTANCE);
    }
    // Line up near top edges without also changing horizontal placement.
    if (Math.abs(p.x + p.width + MODULE_GAP - other.x) <= 64 ||
        Math.abs(other.x + other.width + MODULE_GAP - p.x) <= 64) {
      offer(otherId, p.x, other.y, 0, ALIGN_DISTANCE);
    }
  });
  choices.sort((a, b) => a.score - b.score);
  let result = choices[0]?.p ?? p;
  // Surface edge snap has priority over neighbor snap near the canvas origin.
  if (p.y <= SNAP_DISTANCE) result = { ...result, y: 0 };
  if (p.x <= ALIGN_DISTANCE) result = { ...result, x: 0 };
  return { position: clampMove(result, id, bounds), anchors: choices[0] &&
    result.x === choices[0].p.x && result.y === choices[0].p.y ? [choices[0].target] : [] };
}

function movedPast(a: ModulePosition, b: ModulePosition, direction: Direction): ModulePosition {
  if (direction === "right") return { ...b, x: a.x + a.width + MODULE_GAP };
  if (direction === "left") return { ...b, x: a.x - b.width - MODULE_GAP };
  if (direction === "bottom") return { ...b, y: a.y + a.height + MODULE_GAP };
  return { ...b, y: a.y - b.height - MODULE_GAP };
}
type Direction = "left" | "right" | "top" | "bottom";

/** Transactional chain push: failed operations do not touch the caller's layout. */
function pushCollisions(layout: DashboardLayout, sourceId: string, direction: Direction, bounds: SurfaceBounds, fixedId?: string, validate = true): boolean {
  const queue = [sourceId];
  let operations = 0;
  const maxOperations = Object.keys(layout).length ** 2;
  while (queue.length > 0) {
    if (++operations > maxOperations) return false;
    const id = queue.shift()!;
    for (const [otherId, other] of Object.entries(layout)) {
      if (otherId === id || !overlapsWithGap(layout[id], other)) continue;
      if (otherId === fixedId) return false;
      const updated = movedPast(layout[id], other, direction);
      if (!insideSurface(updated, bounds)) return false;
      layout[otherId] = updated;
      queue.push(otherId);
    }
  }
  return !validate || layoutIsValid(layout, bounds);
}

function movementDirection(old: ModulePosition, requested: ModulePosition): Direction {
  const dx = requested.x - old.x;
  const dy = requested.y - old.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top");
}

/** When a chain cannot be pushed, search finite edge-aligned empty positions. */
function nearestFree(id: string, requested: ModulePosition, layout: DashboardLayout, bounds: SurfaceBounds): ModulePosition | null {
  const xs = new Set([requested.x, 0, bounds.width - requested.width]);
  const ys = new Set([requested.y, 0, bounds.height - requested.height]);
  Object.entries(layout).forEach(([otherId, other]) => {
    if (otherId === id) return;
    [other.x, other.x - requested.width - MODULE_GAP, other.x + other.width + MODULE_GAP].forEach(x => xs.add(x));
    [other.y, other.y - requested.height - MODULE_GAP, other.y + other.height + MODULE_GAP].forEach(y => ys.add(y));
  });
  let best: ModulePosition | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const x of xs) for (const y of ys) {
    const p = { ...requested, x, y };
    if (!insideSurface(p, bounds) || Object.entries(layout).some(([otherId, other]) => otherId !== id && overlapsWithGap(p, other))) continue;
    const score = distance(requested, p);
    if (score < bestScore) { best = p; bestScore = score; }
  }
  return best;
}

export function resolveModulePosition(id: string, requested: ModulePosition, current: DashboardLayout, bounds: SurfaceBounds = DEFAULT_SURFACE): DashboardLayout {
  if (!current[id]) return current;
  const bounded = clampMove({ ...current[id], x: requested.x, y: requested.y }, id, bounds);
  const snapped = getSnapResult(id, bounded, current, bounds).position;
  const moved = { ...current, [id]: snapped };
  if (pushCollisions(moved, id, movementDirection(current[id], snapped), bounds)) return moved;
  const free = nearestFree(id, snapped, current, bounds);
  return free ? { ...current, [id]: free } : current;
}

/**
 * Resizing keeps the opposite edge anchored. A growing panel first consumes
 * available neighbor size, then pushes the neighbor/chain if room remains.
 * If that fails, binary-search the largest feasible resize (no rubber-banding).
 */
function requestForEdge(original: ModulePosition, requested: ModulePosition, edge: Direction, id: string, bounds: SurfaceBounds): ModulePosition {
  if (edge === "right") return { ...original, width: clamp(requested.width, minWidthFor(id), bounds.width - original.x) };
  if (edge === "left") {
    const width = clamp(requested.width, minWidthFor(id), original.x + original.width);
    return { ...original, x: original.x + original.width - width, width };
  }
  if (edge === "bottom") return { ...original, height: clamp(requested.height, minHeightFor(id), bounds.height - original.y) };
  const height = clamp(requested.height, minHeightFor(id), original.y + original.height);
  return { ...original, y: original.y + original.height - height, height };
}

function growIntoNeighbors(id: string, target: ModulePosition, edge: Direction, current: DashboardLayout, bounds: SurfaceBounds): DashboardLayout | null {
  const next = copy(current);
  next[id] = target;
  if (layoutIsValid(next, bounds)) return next;
  for (const [neighborId, neighbor] of Object.entries(next)) {
    if (neighborId === id || !overlapsWithGap(next[id], neighbor)) continue;
    const minSize = edge === "left" || edge === "right" ? minWidthFor(neighborId) : minHeightFor(neighborId);
    const dimension = edge === "left" || edge === "right" ? neighbor.width : neighbor.height;
    const shrink = Math.min(dimension - minSize, Math.max(0,
      edge === "right" ? target.x + target.width + MODULE_GAP - neighbor.x :
      edge === "left" ? neighbor.x + neighbor.width + MODULE_GAP - target.x :
      edge === "bottom" ? target.y + target.height + MODULE_GAP - neighbor.y :
      neighbor.y + neighbor.height + MODULE_GAP - target.y));
    let resized = { ...neighbor };
    if (edge === "right") resized = { ...neighbor, x: neighbor.x + shrink, width: neighbor.width - shrink };
    if (edge === "left") resized = { ...neighbor, width: neighbor.width - shrink };
    if (edge === "bottom") resized = { ...neighbor, y: neighbor.y + shrink, height: neighbor.height - shrink };
    if (edge === "top") resized = { ...neighbor, height: neighbor.height - shrink };
    // Any remaining intersection is resolved by shifting, not reducing below min.
    if (overlapsWithGap(target, resized)) resized = movedPast(target, resized, edge);
    if (!insideSurface(resized, bounds)) return null;
    next[neighborId] = resized;
    if (!pushCollisions(next, neighborId, edge, bounds, id, false)) return null;
  }
  return layoutIsValid(next, bounds) ? next : null;
}

function resizeEdge(id: string, requested: ModulePosition, edge: Direction, current: DashboardLayout, bounds: SurfaceBounds): DashboardLayout {
  const original = current[id];
  if (!original) return current;
  const target = requestForEdge(original, requested, edge, id, bounds);
  const grows = edge === "left" || edge === "right" ? target.width > original.width : target.height > original.height;
  if (!grows) return { ...current, [id]: target };
  const attempt = growIntoNeighbors(id, target, edge, current, bounds);
  if (attempt) return attempt;
  let low = 0;
  let high = 1;
  let best = current;
  for (let i = 0; i < 18; i++) {
    const fraction = (low + high) / 2;
    const candidate = requestForEdge(original, {
      ...requested,
      width: Math.round(original.width + (target.width - original.width) * fraction),
      height: Math.round(original.height + (target.height - original.height) * fraction),
    }, edge, id, bounds);
    const trial = growIntoNeighbors(id, candidate, edge, current, bounds);
    if (trial) { best = trial; low = fraction; }
    else high = fraction;
  }
  return best;
}

export function resizeWithNeighbors(id: string, requested: ModulePosition, direction: string, current: DashboardLayout, bounds: SurfaceBounds = DEFAULT_SURFACE): DashboardLayout {
  if (!current[id]) return current;
  // react-rnd calls corners "topLeft", "bottomRight", etc.
  const dir = direction.toLowerCase();
  let result = current;
  if (dir.includes("left")) result = resizeEdge(id, requested, "left", result, bounds);
  else if (dir.includes("right")) result = resizeEdge(id, requested, "right", result, bounds);
  if (dir.includes("top")) result = resizeEdge(id, requested, "top", result, bounds);
  else if (dir.includes("bottom")) result = resizeEdge(id, requested, "bottom", result, bounds);
  return result;
}

export function findChangedNeighborIds(id: string, before: DashboardLayout, after: DashboardLayout): string[] {
  return Object.keys(before).filter(otherId => otherId !== id && after[otherId] && !close(before[otherId], after[otherId]));
}
export function findMoveGuide(id: string, p: ModulePosition, layout: DashboardLayout, bounds: SurfaceBounds = DEFAULT_SURFACE): SnapTarget | null {
  if (!layout[id]) return null;
  const [anchor] = getSnapResult(id, clampMove(p, id, bounds), layout, bounds).anchors;
  return anchor ? { moduleId: anchor } : null;
}
export function findMoveAffectedModules(id: string, requested: ModulePosition, current: DashboardLayout, bounds: SurfaceBounds = DEFAULT_SURFACE): string[] {
  const next = resolveModulePosition(id, requested, current, bounds);
  const affected = findChangedNeighborIds(id, current, next);
  const bounded = clampMove(requested, id, bounds);
  const snap = getSnapResult(id, bounded, current, bounds);
  const [target] = snap.anchors;
  if (target && !close(snap.position, bounded) && current[id] && next[id] && !close(next[id], current[id]) &&
      close(next[id], snap.position) && !affected.includes(target)) affected.push(target);
  return affected;
}

/** Recover a valid full layout when the viewport is too narrow or stored geometry is stale. */
export function fitLayoutToWidth(layout: DashboardLayout, width: number): DashboardLayout {
  const safeWidth = Math.max(MIN_SURFACE_WIDTH, Math.floor(width));
  const ordered = moduleIds.map(id => [id, layout[id] ?? defaults[id]] as const);
  const candidate = Object.fromEntries(ordered.map(([id, p]) => [id, { ...p }])) as DashboardLayout;
  const tallest = Math.max(999, ...ordered.map(([, p]) => p.y + p.height + MODULE_GAP));
  if (layoutIsValid(candidate, { width: safeWidth, height: tallest })) return candidate;
  // Deterministic shelf packing: preserve panel sizes, allow vertical scrolling.
  const packed: DashboardLayout = {};
  let x = 0, y = 0, rowHeight = 0;
  for (const [id, p] of ordered) {
    const panelWidth = clamp(p.width, minWidthFor(id), safeWidth);
    const panelHeight = Math.max(p.height, minHeightFor(id));
    if (x > 0 && x + panelWidth > safeWidth) { x = 0; y += rowHeight + MODULE_GAP; rowHeight = 0; }
    packed[id] = { x, y, width: panelWidth, height: panelHeight };
    x += panelWidth + MODULE_GAP;
    rowHeight = Math.max(rowHeight, panelHeight);
  }
  return packed;
}

export function requiredSurfaceHeight(layout: DashboardLayout, minimumHeight = DEFAULT_SURFACE.height): number {
  return Math.max(minimumHeight, ...Object.values(layout).map(p => p.y + p.height + MODULE_GAP));
}

/** Ignore malformed or partial persisted geometry. Never use it directly as render state. */
export function parseSavedLayout(raw: unknown): DashboardLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { version?: number; layout?: Record<string, ModulePosition> };
  if (value.version !== 1 || !value.layout || typeof value.layout !== "object") return null;
  const next: DashboardLayout = {};
  for (const id of moduleIds) {
    const p = value.layout[id];
    if (!p || ![p.x, p.y, p.width, p.height].every(Number.isFinite) || p.width < minWidthFor(id) || p.height < minHeightFor(id) || p.x < 0 || p.y < 0) return null;
    next[id] = { x: p.x, y: p.y, width: p.width, height: p.height };
  }
  return next;
}
