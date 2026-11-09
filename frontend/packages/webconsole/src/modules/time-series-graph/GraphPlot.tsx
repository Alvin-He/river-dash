import { useEffect, useRef } from "react";
import {
	createPolylinePoints,
	formatAxisValue,
	getStrokeDasharray,
	getTickPosition,
	getTimeTicks,
	pointsInTimeRange,
} from "./graphMath";
import type { GraphScale } from "./graphMath";
import type { GraphSeries } from "./types";
import styles from "./TimeSeriesGraphModule.module.css";

interface GraphPlotProps {
	series: GraphSeries[];
	scale: GraphScale;
	startTime: number;
	endTime: number;
	latestTime: number;
	tickSeconds: number | null;
	onVerticalPan: (fraction: number) => void;
	onVerticalZoom: (factor: number) => void;
	onHorizontalPan: (fraction: number) => void;
	onHorizontalZoom: (factor: number) => void;
}

export function GraphPlot({
	series,
	scale,
	startTime,
	endTime,
	latestTime,
	tickSeconds,
	onVerticalPan,
	onVerticalZoom,
	onHorizontalPan,
	onHorizontalZoom,
}: GraphPlotProps) {
	const surfaceRef = useRef<HTMLDivElement>(null);
	const gestures = useRef({
		onVerticalPan,
		onVerticalZoom,
		onHorizontalPan,
		onHorizontalZoom,
	});
	useEffect(() => {
		gestures.current = {
			onVerticalPan,
			onVerticalZoom,
			onHorizontalPan,
			onHorizontalZoom,
		};
	}, [onVerticalPan, onVerticalZoom, onHorizontalPan, onHorizontalZoom]);
	const timeTicks = getTimeTicks(startTime, endTime, latestTime, tickSeconds);
	const mouseDragRef = useRef<{ y: number } | null>(null);

	useEffect(() => {
		const surface = surfaceRef.current;
		if (!surface) return;
		function onWheel(event: WheelEvent) {
			if (!event.cancelable) return;
			event.preventDefault();
			const delta =
				event.deltaY *
				(event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
			if (event.shiftKey) {
				gestures.current.onHorizontalPan(delta / 400);
			} else if (event.ctrlKey || event.metaKey) {
				gestures.current.onVerticalZoom(delta < 0 ? 0.85 : 1.18);
			} else if (event.altKey) {
				gestures.current.onHorizontalZoom(delta < 0 ? 0.85 : 1.18);
			} else {
				gestures.current.onVerticalPan(-delta / 500);
			}
		}
		// Native non-passive listener permits wheel-driven Y panning without scrolling
		// the entire dashboard or triggering browser zoom inside the plot.
		surface.addEventListener("wheel", onWheel, { passive: false });
		return () => surface.removeEventListener("wheel", onWheel);
	}, []);

	function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
		switch (event.key) {
			case "ArrowUp":
				onVerticalPan(0.15);
				break;
			case "ArrowDown":
				onVerticalPan(-0.15);
				break;
			case "ArrowLeft":
				onHorizontalPan(0.25);
				break;
			case "ArrowRight":
				onHorizontalPan(-0.25);
				break;
			case "+":
			case "=":
				onVerticalZoom(0.8);
				break;
			case "-":
				onVerticalZoom(1.25);
				break;
			default:
				return;
		}
		event.preventDefault();
		event.stopPropagation();
	}

	return (
		<section className={styles.plot} aria-label="Time-series graph">
			<div className={styles.legend} aria-label="Displayed measurements">
				{series.length ? (
					series.map((currentSeries) => (
						<span
							key={currentSeries.channel}
							title={`${currentSeries.channel} (${currentSeries.unit})`}
						>
							<svg
								className={styles.legendSwatch}
								viewBox="0 0 20 8"
								aria-hidden="true"
							>
								<line
									x1="0"
									y1="4"
									x2="20"
									y2="4"
									stroke={currentSeries.color}
									strokeWidth="2"
									strokeDasharray={getStrokeDasharray(currentSeries.lineStyle)}
								/>
							</svg>
							{currentSeries.channel} <em>({currentSeries.unit})</em>
						</span>
					))
				) : (
					<span>No measurements selected</span>
				)}
			</div>
			<div className={styles.chartArea}>
				<div className={styles.yAxis} aria-label="Y-axis readings">
					{scale.ticks.map((tick) => (
						<span
							key={tick}
							className={
								Math.abs(tick) < 1e-10 ? styles.axisZero : styles.axisTick
							}
							style={{ top: `${getTickPosition(tick, scale)}%` }}
						>
							{formatAxisValue(tick, scale.interval)}
						</span>
					))}
				</div>
				<div
					ref={surfaceRef}
					className={styles.plotSurface}
					tabIndex={0}
					role="region"
					aria-label="Graph viewport. Scroll vertically to pan Y, Shift-scroll to pan time, Control-scroll to zoom Y, Alt-scroll to zoom time. Arrow keys pan; plus and minus zoom Y."
					onKeyDown={onKeyDown}
					onPointerDown={(event) => {
						if (event.button !== 0 || !event.isPrimary) return;
						mouseDragRef.current = { y: event.clientY };
						event.currentTarget.setPointerCapture(event.pointerId);
					}}
					onPointerMove={(event) => {
						const last = mouseDragRef.current;
						if (!last) return;
						const dy = event.clientY - last.y;
						mouseDragRef.current = { y: event.clientY };
						onVerticalPan(dy / Math.max(80, event.currentTarget.clientHeight));
					}}
					onPointerUp={() => {
						mouseDragRef.current = null;
					}}
					onPointerCancel={() => {
						mouseDragRef.current = null;
					}}
				>
					<svg
						viewBox="0 0 100 100"
						preserveAspectRatio="none"
						aria-hidden="true"
					>
						{scale.ticks.map((tick) => {
							const position = getTickPosition(tick, scale);
							return (
								<line
									key={tick}
									className={
										Math.abs(tick) < 1e-10 ? styles.zeroLine : styles.gridLine
									}
									x1="0"
									x2="100"
									y1={position}
									y2={position}
								/>
							);
						})}
						{timeTicks.map((tick) => (
							<line
								key={tick.position}
								className={styles.verticalGridLine}
								x1={tick.position}
								x2={tick.position}
								y1="0"
								y2="100"
							/>
						))}
						{series.map((currentSeries) => (
							<polyline
								key={currentSeries.channel}
								className={styles.trace}
								points={createPolylinePoints(
									pointsInTimeRange(currentSeries.points, startTime, endTime),
									scale,
									startTime,
									endTime,
								)}
								stroke={currentSeries.color}
								strokeDasharray={getStrokeDasharray(currentSeries.lineStyle)}
							/>
						))}
					</svg>
					<div className={styles.timeAxis} aria-hidden="true">
						{timeTicks.map((tick) => (
							<span key={tick.position} style={{ left: `${tick.position}%` }}>
								{tick.label}
							</span>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
