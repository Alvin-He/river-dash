import { useRef, useState } from "react";
import type { ModulePosition } from "../components/FloatingModule";
import {
  createInitialLayout, findChangedNeighborIds, findMoveAffectedModules,
  fitLayoutToWidth, MIN_SURFACE_WIDTH, parseSavedLayout, resizeWithNeighbors,
  resolveModulePosition, requiredSurfaceHeight,
  type DashboardLayout, type SurfaceBounds,
} from "./dashboardLayout";

const STORAGE_KEY = "river-dash-layout-v1";
type ResizeStart = { moduleId: string; layout: DashboardLayout };
type DragPreview = { moduleId: string; position: ModulePosition };

function persistLayout(layout: DashboardLayout) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, layout })); }
  catch { /* storage may be unavailable */ }
}

function loadLayout(): DashboardLayout {
  try {
    return parseSavedLayout(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")) ?? createInitialLayout();
  } catch { return createInitialLayout(); }
}

/**
 * Committed geometry is independent of viewport-derived packing, so temporarily
 * narrowing a browser doesn't overwrite the user's larger-screen arrangement.
 * Only a pointer-release commits layout changes to local storage.
 */
export function useDashboardLayout(viewport: SurfaceBounds) {
  const [committed, setCommitted] = useState(loadLayout);
  const [liveResize, setLiveResize] = useState<DashboardLayout | null>(null);
  const liveResizeRef = useRef<DashboardLayout | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [resizeStart, setResizeStart] = useState<ResizeStart | null>(null);
  const resizeStartRef = useRef<ResizeStart | null>(null);

  // Derive narrow-window layout during render: no viewport-triggered state effect.
  const positions = fitLayoutToWidth(liveResize ?? committed, viewport.width);
  const bounds = {
    width: Math.max(MIN_SURFACE_WIDTH, viewport.width),
    height: requiredSurfaceHeight(positions, viewport.height),
  };
  const affectedModuleIds = new Set(
    dragPreview
      ? findMoveAffectedModules(dragPreview.moduleId, dragPreview.position, positions, bounds)
      : resizeStart
        ? findChangedNeighborIds(resizeStart.moduleId, resizeStart.layout, positions)
        : [],
  );

  const updatePosition = (moduleId: string) => (requested: ModulePosition) => {
    const next = resolveModulePosition(moduleId, requested, positions, bounds);
    setCommitted(next);
    setDragPreview(null);
    persistLayout(next);
  };
  const updateResize = (moduleId: string) => (requested: ModulePosition, direction: string) => {
    const baseline = resizeStartRef.current?.moduleId === moduleId
      ? resizeStartRef.current.layout : positions;
    const next = resizeWithNeighbors(moduleId, requested, direction, baseline, bounds);
    liveResizeRef.current = next;
    setLiveResize(next);
  };
  const previewMove = (moduleId: string) => (position: ModulePosition) =>
    setDragPreview({ moduleId, position });
  const clearDragPreview = () => setDragPreview(null);
  const beginResize = (moduleId: string) => () => {
    setDragPreview(null);
    const snapshot = { moduleId, layout: positions };
    resizeStartRef.current = snapshot;
    setResizeStart(snapshot);
    liveResizeRef.current = null;
    setLiveResize(null);
  };
  const endResize = () => {
    const next = liveResizeRef.current ?? positions;
    setCommitted(next);
    setLiveResize(null);
    liveResizeRef.current = null;
    resizeStartRef.current = null;
    setResizeStart(null);
    persistLayout(next);
  };
  const resetLayout = () => {
    const defaults = createInitialLayout();
    setCommitted(defaults);
    setLiveResize(null);
    liveResizeRef.current = null;
    resizeStartRef.current = null;
    setResizeStart(null);
    setDragPreview(null);
    persistLayout(defaults);
  };

  return {
    positions, bounds, affectedModuleIds, updatePosition, updateResize,
    previewMove, clearDragPreview, beginResize, endResize, resetLayout,
  };
}
