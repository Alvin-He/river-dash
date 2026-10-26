import { useState } from "react";
import type { ModulePosition } from "../components/FloatingModule";
import {
	createInitialLayout,
	findChangedNeighborIds,
	findMoveAffectedModules,
	resizeWithNeighbors,
	resolveModulePosition,
	type DashboardLayout,
} from "./dashboardLayout";

/** State for the currently dragged module (used only for visual feedback). */
interface DragPreview {
	moduleId: string;
	position: ModulePosition;
}

/** The original layout is needed to identify neighbors changed by a resize. */
interface ResizeStart {
	moduleId: string;
	layout: DashboardLayout;
}

/**
 * Coordinates module interactions without duplicating layout calculations.
 *
 * - During drag, only the preview changes; placement is committed on drag stop.
 * - During resize, geometry updates immediately via the existing layout engine.
 * - The active module never appears in the set of affected (glowing) neighbors.
 *
 * Keep the layout rules in dashboardLayout.ts, not in this React hook.
 */
export function useDashboardLayout() {
	const [positions, setPositions] = useState(createInitialLayout);
	const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
	const [resizeStart, setResizeStart] = useState<ResizeStart | null>(null);

	const affectedModuleIds = new Set(
		dragPreview
			? findMoveAffectedModules(dragPreview.moduleId, dragPreview.position, positions)
			: resizeStart
				? findChangedNeighborIds(resizeStart.moduleId, resizeStart.layout, positions)
				: [],
	);

	const updatePosition = (moduleId: string) => (requested: ModulePosition) => {
		setDragPreview(null);
		setPositions((current) => resolveModulePosition(moduleId, requested, current));
	};

	const updateResize = (moduleId: string) => (
		requested: ModulePosition,
		direction: string,
	) => {
		setPositions((current) =>
			resizeWithNeighbors(moduleId, requested, direction, current),
		);
	};

	const previewMove = (moduleId: string) => (requested: ModulePosition) => {
		setDragPreview({ moduleId, position: requested });
	};

	const clearDragPreview = () => setDragPreview(null);
	const beginResize = (moduleId: string) => () => {
		setDragPreview(null);
		setResizeStart({ moduleId, layout: positions });
	};
	const endResize = () => setResizeStart(null);

	return {
		positions,
		affectedModuleIds,
		updatePosition,
		updateResize,
		previewMove,
		clearDragPreview,
		beginResize,
		endResize,
	};
}
