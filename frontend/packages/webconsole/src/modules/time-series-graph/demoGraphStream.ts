import type { GraphDataStream, GraphPoint, GraphSeries } from "./types";

// Keep up to one hour of samples so a user can zoom out or pan back in time.
const HISTORY_LENGTH = 3601;
const SAMPLE_INTERVAL_MS = 1_000;

const graphDefinitions = [
	{
		channel: "ox_pressure",
		unit: "psi",
		color: "#ffd95a",
		baseline: 428,
		variation: 3.5,
		lineStyle: "solid",
	},
	{
		channel: "fuel_pressure",
		unit: "psi",
		color: "#e3b878",
		baseline: 391,
		variation: 3,
		lineStyle: "dash",
	},
	{
		channel: "ox_tank_mass",
		unit: "kg",
		color: "#8ff5dc",
		baseline: 613,
		variation: 2.5,
		lineStyle: "solid",
	},
	{
		channel: "fuel_tank_mass",
		unit: "kg",
		color: "#c8d2ff",
		baseline: 284,
		variation: 2,
		lineStyle: "dash",
	},
	{
		channel: "stand_load",
		unit: "kg",
		color: "#b8f56a",
		baseline: 302,
		variation: 1.5,
		lineStyle: "dot",
	},
	{
		channel: "thrust_chamber_temp",
		unit: "°C",
		color: "#55b96d",
		baseline: 25,
		variation: 1.2,
		lineStyle: "dash-dot",
	},
	{
		channel: "injector_delta_p",
		unit: "psi",
		color: "#dda3f2",
		baseline: 36,
		variation: 1.5,
		lineStyle: "dot",
	},
	{
		channel: "vent_line_pressure",
		unit: "psi",
		color: "#f27676",
		baseline: 14.7,
		variation: 0.6,
		lineStyle: "dash-dot",
	},
] as const;

export const demoGraphChannels: ReadonlyArray<{
	channel: string;
	unit: string;
}> = graphDefinitions.map(({ channel, unit }) => ({ channel, unit }));

function createHistory(
	baseline: number,
	variation: number,
	now: number,
): GraphPoint[] {
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

/** Shared demo feed: all modules observe the same sample timestamps and values. */
const subscribers = new Set<(series: GraphSeries[]) => void>();
let sharedSeries: GraphSeries[] | null = null;
let intervalId: number | undefined;

export const demoGraphStream: GraphDataStream = {
	subscribe(onSeries) {
		subscribers.add(onSeries);
		if (!sharedSeries) sharedSeries = createDemoGraphSeries();
		onSeries(sharedSeries);

		if (intervalId === undefined) {
			intervalId = window.setInterval(() => {
				const now = Date.now();
				sharedSeries = (sharedSeries ?? []).map((currentSeries, index) => {
					const definition = graphDefinitions[index];
					const previousValue =
						currentSeries.points.at(-1)?.value ?? definition.baseline;
					const drift = (Math.random() - 0.5) * definition.variation;
					const nextValue =
						previousValue * 0.8 + (definition.baseline + drift) * 0.2;
					return {
						...currentSeries,
						points: [
							...currentSeries.points.slice(1),
							{ timestamp: now, value: nextValue },
						],
					};
				});
				for (const listener of subscribers) listener(sharedSeries);
			}, SAMPLE_INTERVAL_MS);
		}
		return () => {
			subscribers.delete(onSeries);
			if (subscribers.size === 0) {
				if (intervalId !== undefined) window.clearInterval(intervalId);
				intervalId = undefined;
				sharedSeries = null;
			}
		};
	},
};
