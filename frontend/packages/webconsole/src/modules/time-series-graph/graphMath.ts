import type { GraphLineStyle, GraphPoint } from "./types";

export interface GraphScale {
	minimum: number;
	maximum: number;
	interval: number;
	ticks: number[];
}

export interface AxisRange {
	minimum: number;
	maximum: number;
}

export interface TimeTick {
	position: number;
	label: string;
}

const NICE_INTERVALS = [1, 2, 2.5, 5, 10];

function getNiceInterval(rawInterval: number): number {
	if (!Number.isFinite(rawInterval) || rawInterval <= 0) return 1;
	const magnitude = 10 ** Math.floor(Math.log10(rawInterval));
	const normalized = rawInterval / magnitude;
	return (
		(NICE_INTERVALS.find((value) => value >= normalized) ?? 10) * magnitude
	);
}

function createTicks(
	minimum: number,
	maximum: number,
	interval: number,
): number[] {
	const ticks: number[] = [];
	const first =
		Math.ceil((minimum - interval / 1_000_000) / interval) * interval;
	for (
		let value = first;
		value <= maximum + interval / 1_000_000 && ticks.length < 24;
		value += interval
	) {
		ticks.push(Number(value.toPrecision(12)));
	}
	return ticks;
}

/** Auto-fit includes zero by default. The user may override this with a manual Y range. */
export function getGraphScale(
	points: GraphPoint[],
	targetIntervals = 5,
): GraphScale {
	let minimum = 0;
	let maximum = 0;
	for (const point of points) {
		if (!Number.isFinite(point.value)) continue;
		minimum = Math.min(minimum, point.value);
		maximum = Math.max(maximum, point.value);
	}
	const interval = getNiceInterval((maximum - minimum || 1) / targetIntervals);
	const lower = Math.floor(minimum / interval) * interval;
	const upper = Math.ceil(maximum / interval) * interval || interval;
	return {
		minimum: lower,
		maximum: upper,
		interval,
		ticks: createTicks(lower, upper, interval),
	};
}

export function getManualGraphScale(
	range: AxisRange,
	targetIntervals = 5,
): GraphScale {
	const interval = getNiceInterval(
		(range.maximum - range.minimum) / targetIntervals,
	);
	return {
		...range,
		interval,
		ticks: createTicks(range.minimum, range.maximum, interval),
	};
}

/** Positive amount pans the displayed Y range upward; negative pans downward. */
export function panYRange(range: AxisRange, fraction: number): AxisRange {
	const span = range.maximum - range.minimum;
	const shift = Math.max(-1e9, Math.min(1e9, span * fraction));
	return { minimum: range.minimum + shift, maximum: range.maximum + shift };
}

/** Factor below one zooms in, above one zooms out around the view midpoint. */
export function zoomYRange(range: AxisRange, factor: number): AxisRange {
	const center = (range.minimum + range.maximum) / 2;
	const halfSpan = Math.max(
		5e-7,
		Math.min(1e9, ((range.maximum - range.minimum) * factor) / 2),
	);
	return { minimum: center - halfSpan, maximum: center + halfSpan };
}

export function pointsInTimeRange(
	points: GraphPoint[],
	start: number,
	end: number,
): GraphPoint[] {
	// Include the immediate neighbors so traces cross the time-window boundaries smoothly.
	const selected: GraphPoint[] = [];
	for (let i = 0; i < points.length; i += 1) {
		const point = points[i];
		if (!Number.isFinite(point.timestamp) || !Number.isFinite(point.value))
			continue;
		if (point.timestamp < start) {
			selected.length = 0;
			selected.push(point);
		} else if (point.timestamp <= end) {
			selected.push(point);
		} else {
			selected.push(point);
			break;
		}
	}
	return selected;
}

export function createPolylinePoints(
	points: GraphPoint[],
	scale: GraphScale,
	startTime: number,
	endTime: number,
): string {
	if (points.length < 2) return "";
	const timeRange = endTime - startTime || 1;
	const valueRange = scale.maximum - scale.minimum || 1;
	// Reduce excessively dense traces without modifying the stored telemetry history.
	const stride = Math.max(1, Math.floor(points.length / 900));
	const selected = points.filter(
		(_, index) => index % stride === 0 || index === points.length - 1,
	);
	return selected
		.map(({ timestamp, value }) => {
			const x = ((timestamp - startTime) / timeRange) * 100;
			const y = 100 - ((value - scale.minimum) / valueRange) * 100;
			return `${x.toFixed(3)},${y.toFixed(3)}`;
		})
		.join(" ");
}

export function getTickPosition(value: number, scale: GraphScale): number {
	return (
		100 - ((value - scale.minimum) / (scale.maximum - scale.minimum || 1)) * 100
	);
}

/** Axis labels are seconds relative to the newest sample in the data source. */
export function getTimeTicks(
	startTime: number,
	endTime: number,
	latestTime: number,
	requestedIntervalSeconds: number | null = null,
): TimeTick[] {
	if (!(endTime > startTime)) return [];
	const durationSeconds = (endTime - startTime) / 1000;
	const intervalSeconds = Math.max(
		requestedIntervalSeconds ?? getNiceInterval(durationSeconds / 5),
		getNiceInterval(durationSeconds / 12),
	);
	const intervalMs = intervalSeconds * 1000;
	const first = Math.ceil(startTime / intervalMs) * intervalMs;
	const ticks: TimeTick[] = [];
	for (
		let timestamp = first;
		timestamp <= endTime + 1 && ticks.length < 14;
		timestamp += intervalMs
	) {
		const secondsAgo = (latestTime - timestamp) / 1000;
		ticks.push({
			position: ((timestamp - startTime) / (endTime - startTime)) * 100,
			label: `${secondsAgo <= 0.05 ? 0 : -Number(secondsAgo.toFixed(secondsAgo < 10 ? 1 : 0))}s`,
		});
	}
	return ticks;
}

export function formatAxisValue(value: number, interval: number): string {
	const decimals = interval < 1 ? Math.ceil(-Math.log10(interval)) : 0;
	return value.toFixed(Math.min(decimals, 4));
}

export function getStrokeDasharray(
	lineStyle: GraphLineStyle = "solid",
): string | undefined {
	if (lineStyle === "dash") return "8 5";
	if (lineStyle === "dot") return "2 4";
	if (lineStyle === "dash-dot") return "8 4 2 4";
	return undefined;
}
