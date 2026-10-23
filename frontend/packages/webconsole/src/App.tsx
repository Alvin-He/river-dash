import { useState } from "react";
import { FloatingModule, type ModulePosition } from "./components/FloatingModule";
import {
	createInitialLayout,
	findChangedNeighborIds,
	findMoveAffectedModules,
	resizeWithNeighbors,
	resolveModulePosition,
	type DashboardLayout,
} from "./layout/dashboardLayout";
import { PlaceholderModule } from "./modules/placeholder";
import { demoTelemetryStream, TelemetryModule } from "./modules/telemetry";
import { TimeSeriesGraphModule } from "./modules/time-series-graph";
import "./App.css";

function App() {
	const [positions, setPositions] = useState(createInitialLayout);
	const [isLocked, setIsLocked] = useState(false);
	const [dragPreview, setDragPreview] = useState<{
		moduleId: string;
		position: ModulePosition;
	} | null>(null);
	const [resizeStart, setResizeStart] = useState<{
		moduleId: string;
		layout: DashboardLayout;
	} | null>(null);

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

	return (
		<main className="console">
			<header className="topbar">
				<div className="brand">
					<span>N</span>
					<b>NILE CONSOLE</b>
					<small>TS-01 / SOUTH PAD</small>
				</div>
				<button
					className="layout-lock"
					onClick={() => setIsLocked((locked) => !locked)}
				>
					{isLocked ? "Edit layout" : "Lock layout"}
				</button>
				<p className="connection">● LIVE · 24.8 Hz</p>
			</header>

			<section className="dashboard-canvas" aria-label="Movable dashboard modules">
				<div className="module-surface">
					<FloatingModule
						position={positions.pressure}
						isLocked={isLocked}
						onPositionChange={updatePosition("pressure")}
						onResize={updateResize("pressure")}
						onDragPreview={previewMove("pressure")}
						onDragEnd={clearDragPreview}
						onResizeStart={beginResize("pressure")}
						onResizeEnd={endResize}
					>
						<PlaceholderModule
							title="Propellant pressures"
							isAffected={affectedModuleIds.has("pressure")}
						/>
					</FloatingModule>

					<FloatingModule
						position={positions.telemetry}
						minHeight={190}
						isLocked={isLocked}
						onPositionChange={updatePosition("telemetry")}
						onResize={updateResize("telemetry")}
						onDragPreview={previewMove("telemetry")}
						onDragEnd={clearDragPreview}
						onResizeStart={beginResize("telemetry")}
						onResizeEnd={endResize}
					>
						<TelemetryModule
							stream={demoTelemetryStream}
							isAffected={affectedModuleIds.has("telemetry")}
						/>
					</FloatingModule>

					<FloatingModule
						position={positions.pid}
						isLocked={isLocked}
						onPositionChange={updatePosition("pid")}
						onResize={updateResize("pid")}
						onDragPreview={previewMove("pid")}
						onDragEnd={clearDragPreview}
						onResizeStart={beginResize("pid")}
						onResizeEnd={endResize}
					>
						<PlaceholderModule title="P&ID" isAffected={affectedModuleIds.has("pid")} />
					</FloatingModule>

					<FloatingModule
						position={positions.controls}
						isLocked={isLocked}
						onPositionChange={updatePosition("controls")}
						onResize={updateResize("controls")}
						onDragPreview={previewMove("controls")}
						onDragEnd={clearDragPreview}
						onResizeStart={beginResize("controls")}
						onResizeEnd={endResize}
					>
						<PlaceholderModule
							title="Mode & Valve Control"
							isAffected={affectedModuleIds.has("controls")}
						/>
					</FloatingModule>

					<FloatingModule
						position={positions.events}
						isLocked={isLocked}
						onPositionChange={updatePosition("events")}
						onResize={updateResize("events")}
						onDragPreview={previewMove("events")}
						onDragEnd={clearDragPreview}
						onResizeStart={beginResize("events")}
						onResizeEnd={endResize}
					>
						<PlaceholderModule
							title="Operator event log"
							isAffected={affectedModuleIds.has("events")}
						/>
					</FloatingModule>

					<FloatingModule
						position={positions.graphs}
						minHeight={280}
						isLocked={isLocked}
						onPositionChange={updatePosition("graphs")}
						onResize={updateResize("graphs")}
						onDragPreview={previewMove("graphs")}
						onDragEnd={clearDragPreview}
						onResizeStart={beginResize("graphs")}
						onResizeEnd={endResize}
					>
						<TimeSeriesGraphModule
							isAffected={affectedModuleIds.has("graphs")}
						/>
					</FloatingModule>
				</div>
			</section>
		</main>
	);
}

export default App;
