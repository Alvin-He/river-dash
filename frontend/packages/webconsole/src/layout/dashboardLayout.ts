import type { ModulePosition } from "../components/FloatingModule";

const MODULE_GAP = 16;
const SNAP_DISTANCE = 32;
const HEADER_SNAP_DISTANCE = 32;
const TOP_ALIGN_DISTANCE = 12;
const EDGE_ALIGN_DISTANCE = 64;
const MIN_WIDTH = 260;
const MIN_HEIGHT = 150;
const MIN_HEIGHT_BY_MODULE: Record<string, number> = { telemetry: 190, graphs: 280 };
const SURFACE_WIDTH = 1888;
const SURFACE_HEIGHT = 999;

export type DashboardLayout = Record<string, ModulePosition>;

export interface SnapTarget {
	moduleId: string;
}

const initialPositions: DashboardLayout = {
	pressure: { x: 0, y: 0, width: 340, height: 260 },
	telemetry: { x: 356, y: 0, width: 350, height: 340 },
	pid: { x: 356, y: 356, width: 350, height: 250 },
	controls: { x: 722, y: 0, width: 350, height: 410 },
	events: { x: 722, y: 426, width: 350, height: 220 },
	graphs: { x: 1088, y: 0, width: 560, height: 420 },
};

export function createInitialLayout(): DashboardLayout {
	return Object.fromEntries(
		Object.entries(initialPositions).map(([moduleId, position]) => [
			moduleId,
			{ ...position },
		]),
	);
}

export function resolveModulePosition(
	moduleId: string,
	requested: ModulePosition,
	current: DashboardLayout,
): DashboardLayout {
	const position = clampToSurface(
		snapToModules(moduleId, clampToSurface(requested), current),
	);
	const active = current[moduleId];
	const direction = getMovementDirection(active, position);
	const pushedLayout = { ...current, [moduleId]: position };

	if (tryPush(pushedLayout, moduleId, direction) && layoutIsValid(pushedLayout)) {
		return pushedLayout;
	}

	const openPosition = findNearestOpenPosition(moduleId, position, current);
	return openPosition ? { ...current, [moduleId]: openPosition } : current;
}

export function resizeWithNeighbors(
	moduleId: string,
	requested: ModulePosition,
	direction: string,
	current: DashboardLayout,
): DashboardLayout {
	const active = current[moduleId];
	if (!active) return current;
	const side = direction.toLowerCase();
	if ((side.includes("left") || side.includes("right")) &&
		(side.includes("top") || side.includes("bottom"))) {
		const horizontal = resizeWithNeighbors(moduleId, requested, side.includes("left") ? "left" : "right", current);
		return resizeWithNeighbors(moduleId, requested, side.includes("top") ? "top" : "bottom", horizontal);
	}
	const target = clampResizeRequest(requested, active, direction, moduleId);
	const result = attemptResize(moduleId, target, direction, current);
	if (matchesPosition(result[moduleId], target)) return result;

	// A blocked resize should stop at its last valid dimension, not jump back.
	let low = 0;
	let high = 1;
	let best = current;
	for (let step = 0; step < 16; step++) {
		const fraction = (low + high) / 2;
		const candidate = clampResizeRequest({
			...requested,
			width: Math.round(active.width + (target.width - active.width) * fraction),
			height: Math.round(active.height + (target.height - active.height) * fraction),
		}, active, direction, moduleId);
		const resized = attemptResize(moduleId, candidate, direction, current);
		if (matchesPosition(resized[moduleId], candidate)) {
			best = resized;
			low = fraction;
		} else {
			high = fraction;
		}
	}
	return best;
}

function matchesPosition(first: ModulePosition, second: ModulePosition): boolean {
	return (
		Math.abs(first.x - second.x) < 0.001 &&
		Math.abs(first.y - second.y) < 0.001 &&
		Math.abs(first.width - second.width) < 0.001 &&
		Math.abs(first.height - second.height) < 0.001
	);
}

function attemptResize(
	moduleId: string,
	requested: ModulePosition,
	direction: string,
	current: DashboardLayout,
): DashboardLayout {
	const active = current[moduleId];
	const next = { ...current, [moduleId]: clampToSurface(requested, moduleId) };
	const normalizedDirection = direction.toLowerCase();
	let allowed = true;

	if (normalizedDirection.includes("right") && next[moduleId].width > active.width) {
		allowed &&= resizeHorizontally(next, moduleId, active, next[moduleId], current, "right");
	}
	if (normalizedDirection.includes("left") && next[moduleId].x < active.x) {
		allowed &&= resizeHorizontally(next, moduleId, active, next[moduleId], current, "left");
	}
	if (normalizedDirection.includes("bottom") && next[moduleId].height > active.height) {
		allowed &&= resizeVertically(
			next, moduleId, { ...active, width: next[moduleId].width }, next[moduleId], current, "bottom",
		);
	}
	if (normalizedDirection.includes("top") && next[moduleId].y < active.y) {
		allowed &&= resizeVertically(
			next, moduleId, { ...active, width: next[moduleId].width }, next[moduleId], current, "top",
		);
	}

	return allowed && layoutIsValid(next) ? next : current;
}

export function findMoveGuide(
	moduleId: string,
	position: ModulePosition,
	modules: DashboardLayout,
): SnapTarget | null {
	const [anchor] = getSnapResult(moduleId, clampToSurface(position), modules).anchors;
	return anchor ? { moduleId: anchor } : null;
}

function getMovementDirection(
	active: ModulePosition,
	position: ModulePosition,
): "left" | "right" | "top" | "bottom" {
	return Math.abs(position.x - active.x) >= Math.abs(position.y - active.y)
		? position.x >= active.x
			? "right"
			: "left"
		: position.y >= active.y
			? "bottom"
			: "top";
}

function findNearestOpenPosition(
	moduleId: string,
	requested: ModulePosition,
	modules: DashboardLayout,
): ModulePosition | null {
	const pending = [requested];
	const examined = new Set<string>();

	while (pending.length) {
		const candidate = pending.shift()!;
		const key = `${candidate.x}:${candidate.y}`;
		if (examined.has(key)) continue;
		examined.add(key);

		const collision = Object.entries(modules).find(
			([otherId, other]) => otherId !== moduleId && overlapsWithGap(candidate, other),
		);
		if (!collision) return candidate;

		const [, obstacle] = collision;
		const options = sidePlacementOptions(candidate, obstacle)
			.filter(insideSurface)
			.sort(
				(first, second) =>
					placementScore(requested, first, obstacle) -
					placementScore(requested, second, obstacle),
			);

		pending.push(...options);
		pending.sort((first, second) => distanceFrom(requested, first) - distanceFrom(requested, second));
	}

	return null;
}

function resizeHorizontally(
	next: DashboardLayout,
	moduleId: string,
	active: ModulePosition,
	requested: ModulePosition,
	current: DashboardLayout,
	side: "left" | "right",
): boolean {
	const neighbors = findAdjacentModules(moduleId, active, current, side);
	if (!neighbors.length) return true;

	const maximumSharedWidth = Math.min(
		...neighbors.map(
			([, neighbor]) =>
				(side === "right"
					? neighbor.x + neighbor.width - active.x
					: active.x + active.width - neighbor.x) -
				MODULE_GAP -
				MIN_WIDTH,
		),
	);
	const activeWidth = clamp(requested.width, MIN_WIDTH, maximumSharedWidth);

	const applySharedResize = (width: number) => {
		const activeX = side === "right" ? active.x : active.x + active.width - width;
		next[moduleId] = { ...requested, x: activeX, width };

		for (const [neighborId, neighbor] of neighbors) {
			const neighborWidth =
				side === "right"
					? neighbor.x + neighbor.width - activeX - width - MODULE_GAP
					: activeX - neighbor.x - MODULE_GAP;
			next[neighborId] =
				side === "right"
					? { ...neighbor, x: activeX + width + MODULE_GAP, width: neighborWidth }
					: { ...neighbor, width: neighborWidth };
		}
	};

	if (requested.width <= maximumSharedWidth) {
		applySharedResize(activeWidth);
		return true;
	}

	const pushed = {
		...next,
		[moduleId]: {
			...requested,
			x: side === "right" ? active.x : requested.x,
			width: requested.width,
		},
	};

	for (const [neighborId, neighbor] of neighbors) {
		pushed[neighborId] =
			side === "right"
				? {
						...neighbor,
						x: pushed[moduleId].x + requested.width + MODULE_GAP,
						width: MIN_WIDTH,
					}
				: {
						...neighbor,
						x: pushed[moduleId].x - MODULE_GAP - MIN_WIDTH,
						width: MIN_WIDTH,
					};
	}

	if (neighbors.every(([neighborId]) => tryPush(pushed, neighborId, side, moduleId))) {
		Object.assign(next, pushed);
	} else {
		applySharedResize(activeWidth);
	}
	return true;
}

function resizeVertically(
	next: DashboardLayout,
	moduleId: string,
	active: ModulePosition,
	requested: ModulePosition,
	current: DashboardLayout,
	side: "top" | "bottom",
): boolean {
	const neighbors = findAdjacentModules(moduleId, active, current, side);
	if (!neighbors.length) return true;

	const maximumSharedHeight = Math.min(
		...neighbors.map(
			([neighborId, neighbor]) =>
				(side === "bottom"
					? neighbor.y + neighbor.height - active.y
					: active.y + active.height - neighbor.y) -
				MODULE_GAP -
				minHeightFor(neighborId),
		),
	);
	const activeHeight = clamp(requested.height, minHeightFor(moduleId), maximumSharedHeight);

	const applySharedResize = (height: number) => {
		const activeY = side === "bottom" ? active.y : active.y + active.height - height;
		next[moduleId] = { ...next[moduleId], y: activeY, height };

		for (const [neighborId, neighbor] of neighbors) {
			const neighborHeight =
				side === "bottom"
					? neighbor.y + neighbor.height - activeY - height - MODULE_GAP
					: activeY - neighbor.y - MODULE_GAP;
			next[neighborId] =
				side === "bottom"
					? { ...neighbor, y: activeY + height + MODULE_GAP, height: neighborHeight }
					: { ...neighbor, height: neighborHeight };
		}
	};

	if (requested.height <= maximumSharedHeight) {
		applySharedResize(activeHeight);
		return true;
	}

	const pushed = {
		...next,
		[moduleId]: {
			...next[moduleId],
			y: side === "bottom" ? active.y : requested.y,
			height: requested.height,
		},
	};

	for (const [neighborId, neighbor] of neighbors) {
		pushed[neighborId] =
			side === "bottom"
				? {
						...neighbor,
						y: pushed[moduleId].y + requested.height + MODULE_GAP,
						height: minHeightFor(neighborId),
					}
				: {
						...neighbor,
						y: pushed[moduleId].y - MODULE_GAP - minHeightFor(neighborId),
						height: minHeightFor(neighborId),
					};
	}

	if (neighbors.every(([neighborId]) => tryPush(pushed, neighborId, side, moduleId))) {
		Object.assign(next, pushed);
	} else {
		applySharedResize(activeHeight);
	}
	return true;
}

function tryPush(
	modules: DashboardLayout,
	sourceId: string,
	direction: "left" | "right" | "top" | "bottom",
	fixedId?: string,
): boolean {
	const snapshot = { ...modules };
	const pending = [sourceId];
	let steps = 0;
	const maximumSteps = Object.keys(modules).length ** 2;

	while (pending.length) {
		if (steps++ >= maximumSteps) {
			Object.assign(modules, snapshot);
			return false;
		}
		const currentId = pending.shift()!;
		const source = modules[currentId];

		for (const [otherId, other] of Object.entries(modules)) {
			if (otherId === currentId || !overlapsWithGap(source, other)) {
				continue;
			}
			if (otherId === fixedId) {
				Object.assign(modules, snapshot);
				return false;
			}

			modules[otherId] = movePast(source, other, direction);
			if (!insideSurface(modules[otherId])) {
				Object.assign(modules, snapshot);
				return false;
			}

			pending.push(otherId);
		}
	}

	return true;
}

function findAdjacentModules(
	moduleId: string,
	active: ModulePosition,
	modules: DashboardLayout,
	side: "left" | "right" | "top" | "bottom",
) {
	return Object.entries(modules).filter(([otherId, other]) => {
		if (otherId === moduleId) return false;

		if (side === "right") {
			return (
				sharesVerticalSpace(active, other) &&
				Math.abs(other.x - (active.x + active.width + MODULE_GAP)) <= MODULE_GAP
			);
		}
		if (side === "left") {
			return (
				sharesVerticalSpace(active, other) &&
				Math.abs(active.x - (other.x + other.width + MODULE_GAP)) <= MODULE_GAP
			);
		}
		if (side === "bottom") {
			return (
				sharesHorizontalSpace(active, other) &&
				Math.abs(other.y - (active.y + active.height + MODULE_GAP)) <= MODULE_GAP
			);
		}

		return (
			sharesHorizontalSpace(active, other) &&
			Math.abs(active.y - (other.y + other.height + MODULE_GAP)) <= MODULE_GAP
		);
	});
}

function snapToModules(
	moduleId: string,
	position: ModulePosition,
	modules: DashboardLayout,
): ModulePosition {
	return getSnapResult(moduleId, position, modules).position;
}

function getSnapResult(
	moduleId: string,
	position: ModulePosition,
	modules: DashboardLayout,
): { position: ModulePosition; anchors: string[] } {
	const candidates: Array<{
		moduleId: string;
		position: ModulePosition;
		score: number;
	}> = [];
	const add = (id: string, candidate: ModulePosition, score: number) => {
		if (insideSurface(candidate)) {
			candidates.push({ moduleId: id, position: candidate, score });
		}
	};

	for (const [otherId, other] of Object.entries(modules)) {
		if (otherId === moduleId) continue;

		const placements = sidePlacementOptions(position, other);
		const [
			leftAligned, rightAligned, topAligned, bottomAligned,
			leftFree, rightFree, topFree, bottomFree,
		] = placements;
		for (const candidate of [leftAligned, rightAligned]) {
			if (
				Math.abs(position.x - candidate.x) <= SNAP_DISTANCE &&
				Math.abs(position.y - candidate.y) <= EDGE_ALIGN_DISTANCE
			) {
				add(otherId, candidate, distanceFrom(position, candidate));
			}
		}
		for (const candidate of [topAligned, bottomAligned]) {
			if (
				Math.abs(position.y - candidate.y) <= SNAP_DISTANCE &&
				Math.abs(position.x - candidate.x) <= EDGE_ALIGN_DISTANCE
			) {
				add(otherId, candidate, distanceFrom(position, candidate));
			}
		}
		if (Math.abs(position.y - other.y) > EDGE_ALIGN_DISTANCE) {
			for (const candidate of [leftFree, rightFree]) {
				if (Math.abs(position.x - candidate.x) <= SNAP_DISTANCE) {
					add(otherId, candidate, distanceFrom(position, candidate) + EDGE_ALIGN_DISTANCE);
				}
			}
		}
		if (Math.abs(position.x - other.x) > EDGE_ALIGN_DISTANCE) {
			for (const candidate of [topFree, bottomFree]) {
				if (Math.abs(position.y - candidate.y) <= SNAP_DISTANCE) {
					add(otherId, candidate, distanceFrom(position, candidate) + EDGE_ALIGN_DISTANCE);
				}
			}
		}
	}

	const best = candidates.sort((a, b) => a.score - b.score)[0];
	let snapped = best?.position ?? position;
	const anchors = best ? [best.moduleId] : [];
	if (position.y <= HEADER_SNAP_DISTANCE) {
		if (best?.position.x === position.x) anchors.length = 0;
		return { position: { ...snapped, y: 0 }, anchors };
	}

	const nearestTop = Object.entries(modules)
		.filter(
			([id, other]) =>
				id !== moduleId &&
				Math.abs(position.y - other.y) <= TOP_ALIGN_DISTANCE &&
				(snapped.x + position.width + MODULE_GAP <= other.x ||
					other.x + other.width + MODULE_GAP <= snapped.x),
		)
		.sort(
			([, a], [, b]) => Math.abs(position.y - a.y) - Math.abs(position.y - b.y),
		)[0];
	if (nearestTop) {
		// A vertical candidate overridden by top alignment is no longer an anchor.
		if (best && best.position.x === position.x && best.position.y !== position.y) {
			anchors.length = 0;
		}
		snapped = { ...snapped, y: nearestTop[1].y };
		if (!anchors.includes(nearestTop[0])) anchors.push(nearestTop[0]);
	}
	return { position: snapped, anchors };
}

function sidePlacementOptions(position: ModulePosition, obstacle: ModulePosition): ModulePosition[] {
	return [
		{ ...position, x: obstacle.x - position.width - MODULE_GAP, y: obstacle.y },
		{ ...position, x: obstacle.x + obstacle.width + MODULE_GAP, y: obstacle.y },
		{ ...position, x: obstacle.x, y: obstacle.y - position.height - MODULE_GAP },
		{ ...position, x: obstacle.x, y: obstacle.y + obstacle.height + MODULE_GAP },
		{ ...position, x: obstacle.x - position.width - MODULE_GAP },
		{ ...position, x: obstacle.x + obstacle.width + MODULE_GAP },
		{ ...position, y: obstacle.y - position.height - MODULE_GAP },
		{ ...position, y: obstacle.y + obstacle.height + MODULE_GAP },
	];
}

function movePast(
	source: ModulePosition,
	other: ModulePosition,
	direction: "left" | "right" | "top" | "bottom",
): ModulePosition {
	if (direction === "right") return { ...other, x: source.x + source.width + MODULE_GAP };
	if (direction === "left") return { ...other, x: source.x - other.width - MODULE_GAP };
	if (direction === "bottom") return { ...other, y: source.y + source.height + MODULE_GAP };
	return { ...other, y: source.y - other.height - MODULE_GAP };
}

function placementScore(
	requested: ModulePosition,
	candidate: ModulePosition,
	obstacle: ModulePosition,
): number {
	const alignsAnEdge = candidate.x === obstacle.x || candidate.y === obstacle.y;
	return distanceFrom(requested, candidate) + (alignsAnEdge ? 0 : EDGE_ALIGN_DISTANCE);
}

/** Keep the edge opposite the grabbed handle fixed at the canvas boundary. */
function clampResizeRequest(
	requested: ModulePosition,
	active: ModulePosition,
	direction: string,
	moduleId: string,
): ModulePosition {
	const side = direction.toLowerCase();
	const left = side.includes("left");
	const right = side.includes("right");
	const top = side.includes("top");
	const bottom = side.includes("bottom");
	const width = left || right
		? clamp(requested.width, MIN_WIDTH, left ? active.x + active.width : SURFACE_WIDTH - active.x)
		: active.width;
	const height = top || bottom
		? clamp(requested.height, minHeightFor(moduleId), top ? active.y + active.height : SURFACE_HEIGHT - active.y)
		: active.height;
	return {
		x: left ? active.x + active.width - width : active.x,
		y: top ? active.y + active.height - height : active.y,
		width,
		height,
	};
}

function clampToSurface(position: ModulePosition, moduleId?: string): ModulePosition {
	const width = clamp(position.width, MIN_WIDTH, SURFACE_WIDTH);
	const height = clamp(position.height, minHeightFor(moduleId ?? ""), SURFACE_HEIGHT);
	return {
		width,
		height,
		x: clamp(position.x, 0, SURFACE_WIDTH - width),
		y: clamp(position.y, 0, SURFACE_HEIGHT - height),
	};
}

function layoutIsValid(modules: DashboardLayout): boolean {
	const entries = Object.entries(modules);
	return (
		entries.every(([, position]) => insideSurface(position)) &&
		entries.every(([moduleId, position], index) =>
			entries
				.slice(index + 1)
				.every(([otherId, other]) => moduleId === otherId || !overlapsWithGap(position, other)),
		)
	);
}

function minHeightFor(moduleId: string): number {
	return MIN_HEIGHT_BY_MODULE[moduleId] ?? MIN_HEIGHT;
}

function insideSurface(position: ModulePosition): boolean {
	return (
		position.x >= 0 &&
		position.y >= 0 &&
		position.x + position.width <= SURFACE_WIDTH &&
		position.y + position.height <= SURFACE_HEIGHT
	);
}

function overlapsWithGap(first: ModulePosition, second: ModulePosition): boolean {
	return (
		first.x < second.x + second.width + MODULE_GAP &&
		first.x + first.width + MODULE_GAP > second.x &&
		first.y < second.y + second.height + MODULE_GAP &&
		first.y + first.height + MODULE_GAP > second.y
	);
}

function sharesVerticalSpace(first: ModulePosition, second: ModulePosition): boolean {
	return first.y < second.y + second.height && first.y + first.height > second.y;
}

function sharesHorizontalSpace(first: ModulePosition, second: ModulePosition): boolean {
	return first.x < second.x + second.width && first.x + first.width > second.x;
}

function distanceFrom(first: ModulePosition, second: ModulePosition): number {
	return Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

/** Identify neighboring panels displaced or resized by an interaction. */
export function findChangedNeighborIds(
	moduleId: string,
	before: DashboardLayout,
	after: DashboardLayout,
): string[] {
	return Object.keys(before).filter((id) => {
		if (id === moduleId || !after[id]) return false;
		const prior = before[id];
		const next = after[id];
		return (
			prior.x !== next.x || prior.y !== next.y ||
			prior.width !== next.width || prior.height !== next.height
		);
	});
}

/** Snap anchors also glow, even if the snap does not push another panel. */
export function findMoveAffectedModules(
	moduleId: string,
	requested: ModulePosition,
	current: DashboardLayout,
): string[] {
	const changed = findChangedNeighborIds(
		moduleId, current, resolveModulePosition(moduleId, requested, current),
	);
	const { anchors } = getSnapResult(moduleId, clampToSurface(requested), current);
	for (const anchor of anchors) {
		if (!changed.includes(anchor)) changed.push(anchor);
	}
	return changed;
}
