import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createInitialLayout,
	DEFAULT_SURFACE,
	fitLayoutToWidth,
	moduleIds,
} from "./dashboardLayout";
import {
	addLayoutConfiguration,
	LAYOUT_CONFIGURATIONS_KEY,
	MAX_LAYOUT_CONFIGURATIONS,
	normalizeLayoutName,
	parseImportedLayoutConfiguration,
	parseLayoutSnapshot,
	readLayoutConfigurations,
	serializeLayoutConfiguration,
	writeLayoutConfigurations,
	type LayoutSnapshot,
} from "./layoutConfigurations";

const snapshot = (): LayoutSnapshot => ({
	version: 1,
	layout: createInitialLayout(),
	referenceWidth: DEFAULT_SURFACE.width,
});

afterEach(() => vi.unstubAllGlobals());

describe("layout configurations", () => {
	it("captures every registered module and preserves reference width", () => {
		const parsed = parseLayoutSnapshot(snapshot());
		expect(parsed?.referenceWidth).toBe(1888);
		expect(Object.keys(parsed?.layout ?? {})).toEqual(moduleIds);
	});

	it("saves named configurations independently with case-insensitive names", () => {
		const first = addLayoutConfiguration([], "  Pre-test  ", snapshot());
		expect(first[0].name).toBe("Pre-test");
		expect(() => addLayoutConfiguration(first, "pre-TEST", snapshot())).toThrow(
			/already exists/,
		);
		const second = addLayoutConfiguration(first, "Post-test", snapshot());
		expect(second.map((item) => item.name)).toEqual(["Pre-test", "Post-test"]);
		expect(first).toHaveLength(1);
	});

	it("persists and restores configurations without modifying the active autosave key", () => {
		const items = new Map<string, string>([
			["river-dash-layout-v1", "untouched-current-layout"],
		]);
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => items.get(key) ?? null,
			setItem: (key: string, value: string) => {
				items.set(key, value);
			},
		});
		const configurations = addLayoutConfiguration(
			[],
			"Mission setup",
			snapshot(),
		);
		writeLayoutConfigurations(configurations);
		expect(items.has(LAYOUT_CONFIGURATIONS_KEY)).toBe(true);
		expect(items.get("river-dash-layout-v1")).toBe("untouched-current-layout");
		expect(readLayoutConfigurations()).toEqual(configurations);
	});

	it("round-trips a portable configuration through JSON", () => {
		const [item] = addLayoutConfiguration([], "Fuel check", snapshot());
		const json = serializeLayoutConfiguration(item);
		expect(parseImportedLayoutConfiguration(json)).toEqual({
			name: "Fuel check",
			snapshot: item.snapshot,
		});
	});

	it("preserves optional graph settings in portable named layouts while accepting older geometry-only layouts", () => {
		const existing = snapshot();
		expect(parseLayoutSnapshot(existing)).toEqual(existing);
		const withGraph = {
			...existing,
			graphSettings: {
				windowSeconds: 120,
				endOffsetSeconds: 10,
				tickSeconds: 15,
				yRange: { minimum: 390, maximum: 450 },
				channels: {
					ox_pressure: { visible: true, color: "#123456", lineStyle: "dash" },
				},
			},
		};
		const [saved] = addLayoutConfiguration([], "Graph setup", withGraph);
		expect(
			parseImportedLayoutConfiguration(serializeLayoutConfiguration(saved))
				.snapshot,
		).toEqual(saved.snapshot);
		expect(saved.snapshot.graphSettings?.channels.ox_pressure.color).toBe(
			"#123456",
		);
		expect(
			parseLayoutSnapshot({ ...withGraph, graphSettings: "unexpected" }),
		).toBeNull();
	});

	it("preserves Telemetry Overview selections in named layouts and accepts older layout files", () => {
		const older = snapshot();
		expect(parseLayoutSnapshot(older)).toEqual(older);
		const withTelemetry = {
			...older,
			telemetrySettings: {
				channels: { ox_pressure: false, stand_load: false },
			},
		};
		const [saved] = addLayoutConfiguration(
			[],
			"Telemetry focus",
			withTelemetry,
		);
		const imported = parseImportedLayoutConfiguration(
			serializeLayoutConfiguration(saved),
		);
		expect(imported.snapshot.telemetrySettings).toEqual(
			withTelemetry.telemetrySettings,
		);
		expect(
			parseLayoutSnapshot({ ...older, telemetrySettings: "bad" }),
		).toBeNull();
		expect(
			parseLayoutSnapshot({
				...older,
				telemetrySettings: { channels: { a: "no" } },
			})?.telemetrySettings,
		).toEqual({ channels: {} });
	});

	it("rejects unsafe or incompatible imported geometry", () => {
		expect(parseLayoutSnapshot({ ...snapshot(), version: 99 })).toBeNull();
		expect(
			parseLayoutSnapshot({ ...snapshot(), referenceWidth: 100 }),
		).toBeNull();
		expect(parseLayoutSnapshot({ ...snapshot(), layout: {} })).toBeNull();
		const overlapping = snapshot();
		overlapping.layout.telemetry = { ...overlapping.layout.pressure };
		expect(parseLayoutSnapshot(overlapping)).toBeNull();
		const outside = snapshot();
		outside.layout.graphs = { ...outside.layout.graphs, x: 1850 };
		expect(parseLayoutSnapshot(outside)).toBeNull();
		expect(() =>
			parseImportedLayoutConfiguration(
				JSON.stringify({ ...snapshot(), format: "fake", name: "Nope" }),
			),
		).toThrow(/format/);
		expect(() => parseImportedLayoutConfiguration("not JSON")).toThrow(
			/valid JSON/,
		);
	});

	it("rejects malformed names and caps the number of saved layouts", () => {
		expect(() => normalizeLayoutName("  ")).toThrow(/Enter a name/);
		expect(() => normalizeLayoutName("x".repeat(49))).toThrow(/48/);
		expect(() => normalizeLayoutName("danger\u0000name")).toThrow(/invalid/);
		const full = Array.from(
			{ length: MAX_LAYOUT_CONFIGURATIONS },
			(_, i) => addLayoutConfiguration([], `Layout ${i}`, snapshot())[0],
		);
		expect(() => addLayoutConfiguration(full, "One more", snapshot())).toThrow(
			/up to 30/,
		);
	});

	it("keeps desktop geometry intact when computing a narrow viewport layout", () => {
		const original = snapshot();
		const copy = structuredClone(original);
		const compact = fitLayoutToWidth(
			original.layout,
			620,
			original.referenceWidth,
		);
		expect(
			Object.values(compact).every((panel) => panel.x + panel.width <= 620),
		).toBe(true);
		expect(original).toEqual(copy);
	});

	it("gracefully skips corrupt saved data", () => {
		vi.stubGlobal("localStorage", { getItem: () => "broken JSON" });
		expect(readLayoutConfigurations()).toEqual([]);
	});
});
