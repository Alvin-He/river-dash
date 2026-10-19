import { useState } from "react";
import { FloatingModule, type ModulePosition } from "./components/FloatingModule";
import {
	createInitialLayout,
	findMoveGuide,
	resizeWithNeighbors,
	resolveModulePosition,
	type SnapTarget,
} from "./layout/dashboardLayout";
import { PlaceholderModule } from "./modules/placeholder";
import { demoTelemetryStream, TelemetryModule } from "./modules/telemetry";
import { TimeSeriesGraphModule } from "./modules/time-series-graph";
import "./App.css";

function App() {
	const [positions, setPositions] = useState(createInitialLayout);
	const [isLocked, setIsLocked] = useState(false);
	const [snapTarget, setSnapTarget] = useState<SnapTarget | null>(null);

	const updatePosition = (moduleId: string) => (requested: ModulePosition) => {
		setSnapTarget(null);
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
		setSnapTarget(findMoveGuide(moduleId, requested, positions));
	};

	const clearSnapTarget = () => setSnapTarget(null);

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
						onDragEnd={clearSnapTarget}
					>
						<PlaceholderModule
							title="Propellant pressures"
							isGuided={snapTarget?.moduleId === "pressure"}
						/>
					</FloatingModule>

					<FloatingModule
						position={positions.telemetry}
						minHeight={190}
						isLocked={isLocked}
						onPositionChange={updatePosition("telemetry")}
						onResize={updateResize("telemetry")}
						onDragPreview={previewMove("telemetry")}
						onDragEnd={clearSnapTarget}
					>
						<TelemetryModule
							stream={demoTelemetryStream}
							isGuided={snapTarget?.moduleId === "telemetry"}
						/>
					</FloatingModule>

					<FloatingModule
						position={positions.pid}
						isLocked={isLocked}
						onPositionChange={updatePosition("pid")}
						onResize={updateResize("pid")}
						onDragPreview={previewMove("pid")}
						onDragEnd={clearSnapTarget}
					>
						<PlaceholderModule title="P&ID" isGuided={snapTarget?.moduleId === "pid"} />
					</FloatingModule>

					<FloatingModule
						position={positions.controls}
						isLocked={isLocked}
						onPositionChange={updatePosition("controls")}
						onResize={updateResize("controls")}
						onDragPreview={previewMove("controls")}
						onDragEnd={clearSnapTarget}
					>
						<PlaceholderModule
							title="Mode & Valve Control"
							isGuided={snapTarget?.moduleId === "controls"}
						/>
					</FloatingModule>

					<FloatingModule
						position={positions.events}
						isLocked={isLocked}
						onPositionChange={updatePosition("events")}
						onResize={updateResize("events")}
						onDragPreview={previewMove("events")}
						onDragEnd={clearSnapTarget}
					>
						<PlaceholderModule
							title="Operator event log"
							isGuided={snapTarget?.moduleId === "events"}
						/>
					</FloatingModule>

					<FloatingModule
						position={positions.graphs}
						minHeight={280}
						isLocked={isLocked}
						onPositionChange={updatePosition("graphs")}
						onResize={updateResize("graphs")}
						onDragPreview={previewMove("graphs")}
						onDragEnd={clearSnapTarget}
					>
						<TimeSeriesGraphModule
							isGuided={snapTarget?.moduleId === "graphs"}
						/>
					</FloatingModule>
				</div>
			</section>
		</main>
	);
}

export default App;
