import { describe, expect, it } from "vitest";
import {
	attachGraphChannel,
	DEFAULT_GRAPH_SETTINGS,
	getPlottedSeries,
	GRAPH_LINE_STYLES,
	GRAPH_PALETTE,
	isPlottedChannel,
	parseGraphSettings,
	pickTraceAppearance,
} from "./graphSettings";
import type { GraphSeries } from "./types";

const demoSeries: GraphSeries[] = Array.from(
	{ length: GRAPH_PALETTE.length * GRAPH_LINE_STYLES.length + 1 },
	(_, index) => ({
		channel: `reading_${index}`,
		unit: "psi",
		color: "#123456",
		points: [{ timestamp: 500, value: index }],
	}),
);

const empty = () => ({
	...DEFAULT_GRAPH_SETTINGS,
	channels: {},
	attachedChannels: [],
});

describe("telemetry channel drops and automatic trace styling", () => {
	it("attaches a supported channel, avoids duplicate drops and refuses unknown data", () => {
		const initial = empty();
		const added = attachGraphChannel(initial, demoSeries, "reading_2");
		expect(isPlottedChannel(added, "reading_2")).toBe(true);
		expect(
			getPlottedSeries(demoSeries, added).map((entry) => entry.channel),
		).toEqual(["reading_2"]);
		expect(added.channels.reading_2).toEqual({
			visible: true,
			color: GRAPH_PALETTE[0],
			lineStyle: "solid",
		});
		expect(attachGraphChannel(added, demoSeries, "reading_2")).toBe(added);
		expect(attachGraphChannel(added, demoSeries, "not_in_graph_stream")).toBe(
			added,
		);
	});

	it("uses each solid color before dashed/dotted combinations, then reuses sparingly", () => {
		let settings = empty();
		for (let index = 0; index < demoSeries.length; index++) {
			settings = attachGraphChannel(settings, demoSeries, `reading_${index}`);
			const trace = settings.channels[`reading_${index}`];
			expect(trace.color).toBe(GRAPH_PALETTE[index % GRAPH_PALETTE.length]);
			expect(trace.lineStyle).toBe(
				GRAPH_LINE_STYLES[
					Math.floor(index / GRAPH_PALETTE.length) % GRAPH_LINE_STYLES.length
				],
			);
		}
		expect(
			new Set(
				getPlottedSeries(demoSeries.slice(0, -1), settings).map(
					(trace) => `${trace.color}/${trace.lineStyle}`,
				),
			).size,
		).toBe(GRAPH_PALETTE.length * GRAPH_LINE_STYLES.length);
	});

	it("avoids combinations already used by manually styled traces", () => {
		const next = pickTraceAppearance([
			{ color: GRAPH_PALETTE[0].toUpperCase(), lineStyle: "solid" },
			{ color: GRAPH_PALETTE[1], lineStyle: "solid" },
		]);
		expect(next).toEqual({ color: GRAPH_PALETTE[2], lineStyle: "solid" });
	});

	it("restores a hidden trace's appearance when free, but avoids clashes", () => {
		const hidden = {
			...empty(),
			attachedChannels: ["reading_0", "reading_1"],
			channels: {
				reading_0: {
					visible: false,
					color: "#aabbcc",
					lineStyle: "dot" as const,
				},
				reading_1: {
					visible: true,
					color: GRAPH_PALETTE[0],
					lineStyle: "solid" as const,
				},
			},
		};
		const restored = attachGraphChannel(hidden, demoSeries, "reading_0");
		expect(restored.channels.reading_0).toEqual({
			visible: true,
			color: "#aabbcc",
			lineStyle: "dot",
		});
		const conflict = {
			...hidden,
			channels: {
				...hidden.channels,
				reading_0: {
					...hidden.channels.reading_0,
					color: GRAPH_PALETTE[0],
					lineStyle: "solid" as const,
				},
			},
		};
		expect(
			attachGraphChannel(conflict, demoSeries, "reading_0").channels.reading_0,
		).toEqual({ visible: true, color: GRAPH_PALETTE[1], lineStyle: "solid" });
	});

	it("loads older preference snapshots with their previous show-every-channel behavior", () => {
		const legacy = parseGraphSettings({
			channels: {
				reading_1: {
					visible: false,
					color: GRAPH_PALETTE[1],
					lineStyle: "dash",
				},
			},
		});
		expect(legacy.attachedChannels).toBeNull();
		expect(
			parseGraphSettings(JSON.parse(JSON.stringify(legacy))).attachedChannels,
		).toBeNull();
		expect(getPlottedSeries(demoSeries, legacy).length).toBe(
			demoSeries.length - 1,
		);
	});
});
