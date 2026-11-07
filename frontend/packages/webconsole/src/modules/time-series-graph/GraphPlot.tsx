import {
	createPolylinePoints,
	formatAxisValue,
	getGraphScale,
	getStrokeDasharray,
	getTickPosition,
	getTimeTicks,
} from "./graphMath";
import type { GraphSeries } from "./types";
import styles from "./TimeSeriesGraphModule.module.css";

interface GraphPlotProps {
	series: GraphSeries[];
}

export function GraphPlot({ series }: GraphPlotProps) {
	const allPoints = series.flatMap((currentSeries) => currentSeries.points);
	const scale = getGraphScale(allPoints);
	const timeTicks = getTimeTicks(series[0]?.points ?? []);

	return (
		<section className={styles.plot} aria-label="Live time-series graph">
			<div className={styles.legend} aria-label="Displayed measurements">
				{series.map((currentSeries) => (
					<span key={currentSeries.channel}>
						<i
							style={{
								borderColor: currentSeries.color,
								borderTopStyle:
									currentSeries.lineStyle === "solid" || !currentSeries.lineStyle
										? "solid"
										: currentSeries.lineStyle === "dot"
											? "dotted"
											: "dashed",
								}}
						/>
						{currentSeries.channel}
					</span>
				))}
			</div>

			<div className={styles.chartArea}>
				<div className={styles.yAxis} aria-hidden="true">
					{scale.ticks.map((tick) => (
						<span
							key={tick}
							className={tick === 0 ? styles.axisZero : styles.axisTick}
							style={{ top: `${getTickPosition(tick, scale)}%` }}
						>
							{formatAxisValue(tick, scale.interval)}
						</span>
					))}
				</div>

				<div className={styles.plotSurface}>
					<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
						{scale.ticks.map((tick) => {
							const position = getTickPosition(tick, scale);

							return (
								<line
									key={tick}
									className={tick === 0 ? styles.zeroLine : styles.gridLine}
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
								points={createPolylinePoints(currentSeries.points, scale)}
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
