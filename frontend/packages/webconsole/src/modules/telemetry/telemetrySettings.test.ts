import { afterEach, describe, expect, it, vi } from "vitest";
import {
	TELEMETRY_SETTINGS_KEY,
	isTelemetryChannelVisible,
	parseTelemetrySettings,
	readTelemetrySettings,
	setAllTelemetryChannelsVisible,
	setTelemetryChannelVisibility,
	writeTelemetrySettings,
} from "./telemetrySettings";

afterEach(() => vi.unstubAllGlobals());

describe("Telemetry Overview channel selections", () => {
	it("shows all channels by default, including newly introduced channels", () => {
		const settings = parseTelemetrySettings(null);
		expect(isTelemetryChannelVisible(settings, "fuel_pressure")).toBe(true);
		expect(isTelemetryChannelVisible(settings, "future_sensor")).toBe(true);
	});

	it("only hides the selected channel, without mutating the original state", () => {
		const original = parseTelemetrySettings(null);
		const next = setTelemetryChannelVisibility(
			original,
			"fuel_pressure",
			false,
		);
		expect(isTelemetryChannelVisible(next, "fuel_pressure")).toBe(false);
		expect(isTelemetryChannelVisible(next, "ox_pressure")).toBe(true);
		expect(isTelemetryChannelVisible(original, "fuel_pressure")).toBe(true);
		expect(setTelemetryChannelVisibility(next, "fuel_pressure", true)).toEqual(
			original,
		);
	});

	it("can hide all current channels and reveal everything without losing the stream", () => {
		const names = ["fuel_pressure", "ox_pressure", "stand_load"];
		const hidden = setAllTelemetryChannelsVisible(
			parseTelemetrySettings(null),
			names,
			false,
		);
		expect(
			names.every((name) => !isTelemetryChannelVisible(hidden, name)),
		).toBe(true);
		expect(isTelemetryChannelVisible(hidden, "new_channel")).toBe(true);
		const shown = setAllTelemetryChannelsVisible(hidden, names, true);
		expect(shown.channels).toEqual({});
	});

	it("treats special property names as ordinary channel IDs", () => {
		const hidden = setTelemetryChannelVisibility(
			parseTelemetrySettings(null),
			"__proto__",
			false,
		);
		expect(isTelemetryChannelVisible(hidden, "__proto__")).toBe(false);
		expect(Object.getPrototypeOf(hidden.channels)).toBe(Object.prototype);
		expect(parseTelemetrySettings(JSON.parse(JSON.stringify(hidden)))).toEqual(
			hidden,
		);
	});

	it("sanitizes imported and corrupted browser settings", () => {
		const parsed = parseTelemetrySettings({
			channels: {
				good: false,
				ignored: "false",
				["x".repeat(241)]: false,
			},
		});
		expect(parsed.channels).toEqual({ good: false });
		expect(parseTelemetrySettings({ channels: [] })).toEqual({ channels: {} });
		expect(parseTelemetrySettings({ channels: 1 })).toEqual({ channels: {} });
	});

	it("persists independently of layout and graph settings", () => {
		const memory = new Map<string, string>();
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => memory.get(key) ?? null,
			setItem: (key: string, value: string) => {
				memory.set(key, value);
			},
		});
		const hidden = setTelemetryChannelVisibility(
			parseTelemetrySettings(null),
			"ox_pressure",
			false,
		);
		writeTelemetrySettings(hidden);
		expect(memory.size).toBe(1);
		expect(memory.has(TELEMETRY_SETTINGS_KEY)).toBe(true);
		expect(readTelemetrySettings()).toEqual(hidden);
	});

	it("continues to work if localStorage is blocked", () => {
		vi.stubGlobal("localStorage", {
			getItem: () => {
				throw new Error("blocked");
			},
			setItem: () => {
				throw new Error("blocked");
			},
		});
		expect(readTelemetrySettings()).toEqual({ channels: {} });
		expect(() =>
			writeTelemetrySettings({ channels: { ox_pressure: false } }),
		).not.toThrow();
	});
});
