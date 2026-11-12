import { describe, expect, it } from "vitest";
import {
	DEFAULT_GRAPH_SETTINGS,
	defaultChannelSettings,
	GRAPH_SETTINGS_KEY,
	parseGraphSettings,
	readGraphSettings,
	writeGraphSettings,
} from "./graphSettings";

describe("time-series graph preference storage", () => {
	it("defaults to 60 seconds with automatic X ticks and Y limits", () => {
		expect(parseGraphSettings(null)).toEqual(DEFAULT_GRAPH_SETTINGS);
	});

	it("sanitizes malformed graph axes and trace colors", () => {
		const settings = parseGraphSettings({
			windowSeconds: 50_000,
			endOffsetSeconds: -30,
			tickSeconds: -1,
			yRange: { minimum: 100, maximum: 90 },
			channels: {
				good: { visible: false, color: "#ff0000", lineStyle: "dash-dot" },
				bad: {
					visible: true,
					color: "url(javascript:foo)",
					lineStyle: "solid",
				},
			},
		});
		expect(settings.windowSeconds).toBe(3600);
		expect(settings.endOffsetSeconds).toBe(0);
		expect(settings.tickSeconds).toBeNull();
		expect(settings.yRange).toBeNull();
		expect(settings.channels).toEqual({
			good: { visible: false, color: "#ff0000", lineStyle: "dash-dot" },
		});
	});

	it("provides an editable hex color for CSS-variable-backed telemetry series", () => {
		expect(
			defaultChannelSettings(
				{
					channel: "pressure",
					unit: "psi",
					color: "var(--series)",
					points: [],
				},
				2,
			).color,
		).toBe("#8ff5dc");
	});

	it("persists measurements and viewing options across reloads", () => {
		const items = new Map<string, string>();
		const storage = {
			getItem: (key: string) => items.get(key) ?? null,
			setItem: (key: string, value: string) => {
				items.set(key, value);
			},
		};
		const original = {
			...DEFAULT_GRAPH_SETTINGS,
			windowSeconds: 120,
			endOffsetSeconds: 30,
			tickSeconds: 15,
			yRange: { minimum: 390, maximum: 430 },
			channels: {
				pressure: {
					visible: false,
					color: "#f00f00",
					lineStyle: "dot" as const,
				},
			},
		};
		writeGraphSettings(original, storage);
		expect(items.has(GRAPH_SETTINGS_KEY)).toBe(true);
		expect(readGraphSettings(storage)).toEqual(original);
	});

	it("handles malformed JSON or blocked browser storage without crashing", () => {
		expect(readGraphSettings({ getItem: () => "{broken" })).toEqual(
			DEFAULT_GRAPH_SETTINGS,
		);
		expect(
			readGraphSettings({
				getItem: () => {
					throw new Error("blocked");
				},
			}),
		).toEqual(DEFAULT_GRAPH_SETTINGS);
		expect(() =>
			writeGraphSettings(DEFAULT_GRAPH_SETTINGS, {
				setItem: () => {
					throw new Error("blocked");
				},
			}),
		).not.toThrow();
	});
});
