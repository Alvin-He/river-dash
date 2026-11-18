import { describe, expect, it } from "vitest";
import {
	createPolylinePoints,
	getGraphScale,
	getManualGraphScale,
	getStrokeDasharray,
	getTimeTicks,
	getTickPosition,
	panYRange,
	pointsInTimeRange,
	zoomYRange,
} from "./graphMath";

const points = [
	{ timestamp: 0, value: 400 },
	{ timestamp: 10_000, value: 405 },
	{ timestamp: 20_000, value: 410 },
	{ timestamp: 30_000, value: 415 },
	{ timestamp: 40_000, value: 420 },
];

describe("time-series axis math", () => {
	it("auto-fits visible points while retaining zero as the baseline", () => {
		const scale = getGraphScale(points);
		expect(scale.minimum).toBe(0);
		expect(scale.maximum).toBeGreaterThanOrEqual(420);
		expect(scale.ticks).toContain(0);
	});

	it("allows a manually entered Y range that excludes zero", () => {
		const scale = getManualGraphScale({ minimum: 390, maximum: 425 });
		expect(scale.minimum).toBe(390);
		expect(scale.maximum).toBe(425);
		expect(scale.ticks).not.toContain(0);
		expect(getTickPosition(425, scale)).toBe(0);
		expect(getTickPosition(390, scale)).toBe(100);
	});

	it("pans vertically without changing the range and zooms about its midpoint", () => {
		const range = { minimum: 0, maximum: 100 };
		expect(panYRange(range, 0.2)).toEqual({ minimum: 20, maximum: 120 });
		expect(zoomYRange(range, 0.5)).toEqual({ minimum: 25, maximum: 75 });
	});

	it("retains neighboring points when an X window is shifted", () => {
		expect(
			pointsInTimeRange(points, 12_000, 28_000).map((point) => point.timestamp),
		).toEqual([10_000, 20_000, 30_000]);
	});

	it("places polyline points on the explicit time range", () => {
		const scale = getManualGraphScale({ minimum: 400, maximum: 420 });
		expect(
			createPolylinePoints(
				pointsInTimeRange(points, 10_000, 30_000),
				scale,
				10_000,
				30_000,
			),
		).toBe(
			"-50.000,100.000 0.000,75.000 50.000,50.000 100.000,25.000 150.000,0.000",
		);
	});

	it("generates X labels with user-selected ticks and a bound on density", () => {
		const ticks = getTimeTicks(0, 60_000, 60_000, 10);
		expect(ticks[0]).toEqual({ position: 0, label: "-60s" });
		expect(ticks.at(-1)).toEqual({ position: 100, label: "0s" });
		expect(getTimeTicks(0, 3_600_000, 3_600_000, 1).length).toBeLessThanOrEqual(
			14,
		);
	});

	it("supports all four trace line types", () => {
		expect(getStrokeDasharray("solid")).toBeUndefined();
		expect(getStrokeDasharray("dash")).toBe("8 5");
		expect(getStrokeDasharray("dot")).toBe("2 4");
		expect(getStrokeDasharray("dash-dot")).toBe("8 4 2 4");
	});
});
