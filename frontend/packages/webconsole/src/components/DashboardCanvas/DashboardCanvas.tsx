import { FloatingModule } from "../FloatingModule";
import { useDashboardLayout } from "../../layout/useDashboardLayout";
import { PlaceholderModule } from "../../modules/placeholder";
import { demoTelemetryStream, TelemetryModule } from "../../modules/telemetry";
import { TimeSeriesGraphModule } from "../../modules/time-series-graph";
import styles from "./DashboardCanvas.module.css";

interface DashboardCanvasProps {
	isLocked: boolean;
}

/**
 * Registers visible dashboard modules and connects them to layout interactions.
 * Feature content lives in modules/, while geometry rules live in layout/.
 * Module-specific minimum heights intentionally match the original dashboard.
 */
export function DashboardCanvas({ isLocked }: DashboardCanvasProps) {
	const {
		positions,
		affectedModuleIds,
		updatePosition,
		updateResize,
		previewMove,
		clearDragPreview,
		beginResize,
		endResize,
	} = useDashboardLayout();

	return (
		<section className={styles.canvas} aria-label="Movable dashboard modules">
			<div className={styles.surface}>
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
	);
}
