import { useEffect, useRef, useState } from "react";
import { DEFAULT_SURFACE, MIN_SURFACE_WIDTH, minWidthFor } from "../../layout/dashboardLayout";
import { FloatingModule } from "../FloatingModule";
import { useDashboardLayout } from "../../layout/useDashboardLayout";
import { PlaceholderModule } from "../../modules/placeholder";
import { demoTelemetryStream, TelemetryModule } from "../../modules/telemetry";
import { TimeSeriesGraphModule } from "../../modules/time-series-graph";
import styles from "./DashboardCanvas.module.css";

interface DashboardCanvasProps {
	isLocked: boolean;
	resetSequence: number;
}

/**
 * Registers visible dashboard modules and connects them to layout interactions.
 * Feature content lives in modules/, while geometry rules live in layout/.
 */
export function DashboardCanvas({ isLocked, resetSequence }: DashboardCanvasProps) {
	const canvasRef = useRef<HTMLElement>(null);
	const [viewport, setViewport] = useState(DEFAULT_SURFACE);
	useEffect(() => {
		const element = canvasRef.current;
		if (!element) return;
		const measure = () => {
			const style = getComputedStyle(element);
			const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
			const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
			setViewport({
				width: Math.max(MIN_SURFACE_WIDTH, Math.floor(element.clientWidth - horizontalPadding)),
				height: Math.max(280, Math.floor(element.clientHeight - verticalPadding)),
			});
		};
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		measure();
		return () => observer.disconnect();
	}, []);
	const {
		positions,
		bounds,
		resetLayout,
		affectedModuleIds,
		updatePosition,
		updateResize,
		previewMove,
		clearDragPreview,
		beginResize,
		endResize,
	} = useDashboardLayout(viewport);
	const previousReset = useRef(resetSequence);
	useEffect(() => {
		if (previousReset.current === resetSequence) return;
		previousReset.current = resetSequence;
		resetLayout();
	}, [resetSequence, resetLayout]);

	return (
		<section ref={canvasRef} className={styles.canvas} aria-label="Movable dashboard modules">
			<div className={styles.surface} style={{ height: bounds.height }}>
				<FloatingModule
					position={positions.pressure}
					minWidth={minWidthFor("pressure")}
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
					minWidth={minWidthFor("telemetry")}
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
					minWidth={minWidthFor("pid")}
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
					minWidth={minWidthFor("controls")}
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
					minWidth={minWidthFor("events")}
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
					minWidth={minWidthFor("graphs")}
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
