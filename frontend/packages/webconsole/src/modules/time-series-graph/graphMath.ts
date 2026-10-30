import type { GraphLineStyle, GraphPoint } from "./types";

export interface GraphScale {
	minimum: number;
	maximum: number;
	interval: number;
	ticks: number[];
}

export interface TimeTick {
	position: number;
	label: string;
}

const NICE_INTERVALS = [1, 2, 2.5, 5, 10];
const TIME_INTERVALS_SECONDS = [1, 2, 5, 10, 15, 30, 60, 120, 300];

/**
 * Builds a readable y-axis that includes zero and the complete visible data
 * range. Five intervals is a useful default for a compact dashboard graph.
 */
export function getGraphScale(points: GraphPoint[], targetIntervals = 5): GraphScale {
	const values = points.map((point) => point.value);
	const dataMinimum = Math.min(0, ...values);
	const dataMaximum = Math.max(0, ...values);
	const dataRange = dataMaximum - dataMinimum || 1;
	const interval = getNiceInterval(dataRange / targetIntervals);
	const minimum = Math.floor(dataMinimum / interval) * interval;
	const maximum = Math.ceil(dataMaximum / interval) * interval || interval;
	const ticks = createTicks(minimum, maximum, interval);

	return { minimum, maximum, interval, ticks };
}

export function createPolylinePoints(
	points: GraphPoint[],
	scale: GraphScale,
	width = 100,
	height = 100,
): string {
	if (points.length < 2) return "";

	const firstTimestamp = points[0].timestamp;
	const lastTimestamp = points[points.length - 1].timestamp;
	const timeRange = lastTimestamp - firstTimestamp || 1;
	const valueRange = scale.maximum - scale.minimum || 1;

	return points
		.map((point) => {
			const x = ((point.timestamp - firstTimestamp) / timeRange) * width;
			const y = height - ((point.value - scale.minimum) / valueRange) * height;
			return `${x.toFixed(2)},${y.toFixed(2)}`;
		})
		.join(" ");
}

export function getTickPosition(value: number, scale: GraphScale): number {
	const range = scale.maximum - scale.minimum || 1;
	return 100 - ((value - scale.minimum) / range) * 100;
}

export function getTimeTicks(points: GraphPoint[]): TimeTick[] {
	if (points.length < 2) return [];

	const firstTimestamp = points[0].timestamp;
	const lastTimestamp = points[points.length - 1].timestamp;
	const durationSeconds = Math.max(1, (lastTimestamp - firstTimestamp) / 1_000);
	const interval = getTimeInterval(durationSeconds / 4);
	const ticks: TimeTick[] = [];

	for (let elapsed = 0; elapsed <= durationSeconds; elapsed += interval) {
		ticks.push({
			position: (elapsed / durationSeconds) * 100,
			label: `${Math.round(durationSeconds - elapsed)} s`,
		});
	}

	const lastTick = ticks.at(-1);
	if (!lastTick || lastTick.position < 100) {
		ticks.push({ position: 100, label: "0 s" });
	}

	return ticks;
}

export function formatAxisValue(value: number, interval: number): string {
	const decimals = interval < 1 ? Math.ceil(-Math.log10(interval)) : 0;
	return value.toFixed(Math.min(decimals, 3));
}

export function getStrokeDasharray(lineStyle: GraphLineStyle = "solid"): string | undefined {
	if (lineStyle === "dash") return "8 5";
	if (lineStyle === "dot") return "2 4";
	if (lineStyle === "dash-dot") return "8 4 2 4";
	return undefined;
}

/**
 * Round a proposed Y-axis tick spacing up to a readable "nice" interval:
 * 1, 2, 2.5, 5, or 10 times a power of ten (e.g., 3.7 -> 5).
 * Used by getGraphScale; unrelated to the time-axis interval chooser.
 */
function getNiceInterval(rawInterval: number): number {
	const exponent = Math.floor(Math.log10(rawInterval));
	const magnitude = 10 ** exponent;
	const normalized = rawInterval / magnitude;
	const niceNormalized = NICE_INTERVALS.find((candidate) => candidate >= normalized) ?? 10;
	return niceNormalized * magnitude;
}

function getTimeInterval(rawInterval: number): number {
	return TIME_INTERVALS_SECONDS.find((interval) => interval >= rawInterval) ?? 300;
}

function createTicks(minimum: number, maximum: number, interval: number): number[] {
	const ticks: number[] = [];
	const epsilon = interval / 1_000_000;

	for (let value = minimum; value <= maximum + epsilon; value += interval) {
		ticks.push(Number(value.toFixed(10)));
	}

	return ticks;
}
