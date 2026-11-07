import type { GraphDataStream, GraphPoint, GraphSeries } from "./types";

const HISTORY_LENGTH = 60;
const SAMPLE_INTERVAL_MS = 1_000;

const graphDefinitions = [
	{
		channel: "ox_pressure",
		unit: "psi",
		color: "var(--color-series-yellow)",
		baseline: 428,
		variation: 3.5,
		lineStyle: "solid",
	},
	{
		channel: "fuel_pressure",
		unit: "psi",
		color: "var(--color-series-gold)",
		baseline: 391,
		variation: 3,
		lineStyle: "dash",
	},
	{
		channel: "ox_tank_mass",
		unit: "kg",
		color: "var(--color-series-mint)",
		baseline: 613,
		variation: 2.5,
		lineStyle: "solid",
	},
	{
		channel: "fuel_tank_mass",
		unit: "kg",
		color: "var(--color-series-blue)",
		baseline: 284,
		variation: 2,
		lineStyle: "dash",
	},
	{
		channel: "stand_load",
		unit: "kg",
		color: "var(--color-series-lime)",
		baseline: 302,
		variation: 1.5,
		lineStyle: "dot",
	},
	{
		channel: "chamber_temp",
		unit: "°C",
		color: "var(--color-series-green)",
		baseline: 25,
		variation: 1.2,
		lineStyle: "dash-dot",
	},
	{
		channel: "injector_delta_p",
		unit: "psi",
		color: "var(--color-series-purple)",
		baseline: 36,
		variation: 1.5,
		lineStyle: "dot",
	},
	{
		channel: "vent_line_pressure",
		unit: "psi",
		color: "var(--color-series-red)",
		baseline: 14.7,
		variation: 0.6,
		lineStyle: "dash-dot",
	},
] as const;

function createHistory(baseline: number, variation: number, now: number): GraphPoint[] {
	return Array.from({ length: HISTORY_LENGTH }, (_, index) => {
		const timestamp = now - (HISTORY_LENGTH - index - 1) * SAMPLE_INTERVAL_MS;
		const wave = Math.sin(index / 5) * variation;
		return { timestamp, value: baseline + wave };
	});
}

export function createDemoGraphSeries(now = Date.now()): GraphSeries[] {
	return graphDefinitions.map((definition) => ({
		channel: definition.channel,
		unit: definition.unit,
		color: definition.color,
		lineStyle: definition.lineStyle,
		points: createHistory(definition.baseline, definition.variation, now),
	}));
}

/** Temporary data source until the Rust backend forwards numeric stream values. */
export const demoGraphStream: GraphDataStream = {
	subscribe(onSeries) {
		let series = createDemoGraphSeries();
		onSeries(series);

		const intervalId = window.setInterval(() => {
			const now = Date.now();
			series = series.map((currentSeries, index) => {
				const definition = graphDefinitions[index];
				const previousValue =
					currentSeries.points.at(-1)?.value ?? definition.baseline;
				const drift = (Math.random() - 0.5) * definition.variation;
				const nextValue = previousValue * 0.8 + (definition.baseline + drift) * 0.2;

				return {
					...currentSeries,
					points: [...currentSeries.points.slice(1), { timestamp: now, value: nextValue }],
				};
			});
			onSeries(series);
		}, SAMPLE_INTERVAL_MS);

		return () => window.clearInterval(intervalId);
	},
};
