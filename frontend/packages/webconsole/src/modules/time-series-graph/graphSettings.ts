import type { GraphLineStyle, GraphSeries } from "./types";
import type { AxisRange } from "./graphMath";

export const GRAPH_SETTINGS_KEY = "river-dash-time-series-graph-v1";
export const MIN_WINDOW_SECONDS = 5;
export const MAX_WINDOW_SECONDS = 3600;
export const MAX_OFFSET_SECONDS = 3600;
const MAX_SAVED_CHANNELS = 128;
export const GRAPH_PALETTE = [
	"#ffd95a",
	"#e3b878",
	"#8ff5dc",
	"#c8d2ff",
	"#b8f56a",
	"#55b96d",
	"#dda3f2",
	"#f27676",
];

export interface ChannelDisplaySettings {
	visible: boolean;
	color: string;
	lineStyle: GraphLineStyle;
}

export interface GraphSettings {
	windowSeconds: number;
	endOffsetSeconds: number;
	tickSeconds: number | null;
	yRange: AxisRange | null;
	channels: Record<string, ChannelDisplaySettings>;
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
	windowSeconds: 60,
	endOffsetSeconds: 0,
	tickSeconds: null,
	yRange: null,
	channels: {},
};

export function clampNumber(
	value: number,
	minimum: number,
	maximum: number,
): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidHex(value: unknown): value is string {
	return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function isLineStyle(value: unknown): value is GraphLineStyle {
	return (
		value === "solid" ||
		value === "dash" ||
		value === "dot" ||
		value === "dash-dot"
	);
}

export function defaultChannelSettings(
	series: GraphSeries,
	index: number,
): ChannelDisplaySettings {
	return {
		visible: true,
		color: isValidHex(series.color)
			? series.color
			: GRAPH_PALETTE[index % GRAPH_PALETTE.length],
		lineStyle: series.lineStyle ?? "solid",
	};
}

/** Untrusted browser storage is validated field-by-field before being applied. */
export function parseGraphSettings(value: unknown): GraphSettings {
	if (!isObject(value)) return { ...DEFAULT_GRAPH_SETTINGS, channels: {} };
	const windowSeconds =
		typeof value.windowSeconds === "number" &&
		Number.isFinite(value.windowSeconds)
			? clampNumber(
					Math.round(value.windowSeconds),
					MIN_WINDOW_SECONDS,
					MAX_WINDOW_SECONDS,
				)
			: 60;
	const endOffsetSeconds =
		typeof value.endOffsetSeconds === "number" &&
		Number.isFinite(value.endOffsetSeconds)
			? clampNumber(Math.round(value.endOffsetSeconds), 0, MAX_OFFSET_SECONDS)
			: 0;
	const tickSeconds =
		typeof value.tickSeconds === "number" &&
		Number.isFinite(value.tickSeconds) &&
		value.tickSeconds >= 1 &&
		value.tickSeconds <= MAX_WINDOW_SECONDS
			? value.tickSeconds
			: null;
	let yRange: AxisRange | null = null;
	if (isObject(value.yRange)) {
		const { minimum, maximum } = value.yRange;
		if (
			typeof minimum === "number" &&
			typeof maximum === "number" &&
			Number.isFinite(minimum) &&
			Number.isFinite(maximum) &&
			minimum < maximum &&
			Math.abs(minimum) < 1e10 &&
			Math.abs(maximum) < 1e10 &&
			maximum - minimum > 1e-8
		) {
			yRange = { minimum, maximum };
		}
	}
	const channels: Record<string, ChannelDisplaySettings> = {};
	if (isObject(value.channels)) {
		for (const [channel, raw] of Object.entries(value.channels).slice(
			0,
			MAX_SAVED_CHANNELS,
		)) {
			if (
				channel.length > 120 ||
				["__proto__", "constructor", "prototype"].includes(channel) ||
				!isObject(raw)
			)
				continue;
			if (
				typeof raw.visible !== "boolean" ||
				!isValidHex(raw.color) ||
				!isLineStyle(raw.lineStyle)
			)
				continue;
			channels[channel] = {
				visible: raw.visible,
				color: raw.color,
				lineStyle: raw.lineStyle,
			};
		}
	}
	return { windowSeconds, endOffsetSeconds, tickSeconds, yRange, channels };
}

export function readGraphSettings(
	storage?: Pick<Storage, "getItem">,
	key = GRAPH_SETTINGS_KEY,
): GraphSettings {
	try {
		const source =
			storage ??
			(typeof window !== "undefined" ? window.localStorage : undefined);
		const raw = source?.getItem(key);
		return raw
			? parseGraphSettings(JSON.parse(raw) as unknown)
			: { ...DEFAULT_GRAPH_SETTINGS, channels: {} };
	} catch {
		return { ...DEFAULT_GRAPH_SETTINGS, channels: {} };
	}
}

export function writeGraphSettings(
	settings: GraphSettings,
	storage?: Pick<Storage, "setItem">,
	key = GRAPH_SETTINGS_KEY,
): void {
	try {
		const target =
			storage ??
			(typeof window !== "undefined" ? window.localStorage : undefined);
		target?.setItem(key, JSON.stringify(settings));
	} catch {
		// Storage may be blocked or full; the current session remains usable.
	}
}
