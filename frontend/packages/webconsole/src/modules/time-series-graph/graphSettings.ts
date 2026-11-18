import type { GraphLineStyle, GraphSeries } from "./types";
import type { AxisRange } from "./graphMath";

export const GRAPH_SETTINGS_KEY = "river-dash-time-series-graph-v1";
export const MIN_WINDOW_SECONDS = 5;
export const MAX_WINDOW_SECONDS = 3600;
export const MAX_OFFSET_SECONDS = 3600;
export const MAX_SAVED_CHANNELS = 128;
export const GRAPH_LINE_STYLES = ["solid", "dash", "dot", "dash-dot"] as const;
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
	/** Null preserves the pre-drag-and-drop behavior of older saved layouts. */
	attachedChannels: string[] | null;
	windowSeconds: number;
	endOffsetSeconds: number;
	tickSeconds: number | null;
	yRange: AxisRange | null;
	channels: Record<string, ChannelDisplaySettings>;
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
	attachedChannels: [],
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
	// Older settings had no membership list and displayed all stream channels by default.
	const attachedChannels = Array.isArray(value.attachedChannels)
		? [
				...new Set(
					value.attachedChannels.filter(
						(channel): channel is string =>
							typeof channel === "string" &&
							channel.length > 0 &&
							channel.length <= 120 &&
							!["__proto__", "constructor", "prototype"].includes(channel),
					),
				),
			].slice(0, MAX_SAVED_CHANNELS)
		: value.attachedChannels === undefined || value.attachedChannels === null
			? null
			: [];
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
	return {
		attachedChannels,
		windowSeconds,
		endOffsetSeconds,
		tickSeconds,
		yRange,
		channels,
	};
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

/** A channel is in the visible plot if it was attached and not subsequently hidden. */
export function isPlottedChannel(
	settings: GraphSettings,
	channel: string,
): boolean {
	return (
		(settings.attachedChannels === null ||
			settings.attachedChannels.includes(channel)) &&
		settings.channels[channel]?.visible !== false
	);
}

export function getPlottedSeries(
	series: GraphSeries[],
	settings: GraphSettings,
): GraphSeries[] {
	return series.flatMap((entry, index) =>
		isPlottedChannel(settings, entry.channel)
			? [
					{
						...entry,
						...defaultChannelSettings(entry, index),
						...settings.channels[entry.channel],
					},
				]
			: [],
	);
}

/** Prefer unused solid colors, then unused dash patterns for each default color. */
export function pickTraceAppearance(
	used: ReadonlyArray<Pick<ChannelDisplaySettings, "color" | "lineStyle">>,
): Pick<ChannelDisplaySettings, "color" | "lineStyle"> {
	const counts = new Map<string, number>();
	for (const entry of used) {
		const key = `${entry.color.toLowerCase()}|${entry.lineStyle}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	let best = {
		color: GRAPH_PALETTE[0],
		lineStyle: GRAPH_LINE_STYLES[0] as GraphLineStyle,
	};
	let fewest = Infinity;
	for (const lineStyle of GRAPH_LINE_STYLES) {
		for (const color of GRAPH_PALETTE) {
			const count = counts.get(`${color}|${lineStyle}`) ?? 0;
			if (count < fewest) {
				best = { color, lineStyle };
				fewest = count;
			}
			if (count === 0) return best;
		}
	}
	return best;
}

/** Pure update shared by drag/drop and channel controls. No-op for unsupported/visible channels. */
export function attachGraphChannel(
	settings: GraphSettings,
	series: GraphSeries[],
	channel: string,
): GraphSettings {
	const index = series.findIndex((entry) => entry.channel === channel);
	if (index < 0 || isPlottedChannel(settings, channel)) return settings;
	const visibleStyles = getPlottedSeries(series, settings).map((entry) => ({
		color: entry.color,
		lineStyle: entry.lineStyle ?? "solid",
	}));
	const previous = settings.channels[channel];
	const priorStyleFree =
		previous &&
		!visibleStyles.some(
			(style) =>
				style.color.toLowerCase() === previous.color.toLowerCase() &&
				style.lineStyle === previous.lineStyle,
		);
	const appearance = priorStyleFree
		? { color: previous.color, lineStyle: previous.lineStyle }
		: pickTraceAppearance(visibleStyles);
	return {
		...settings,
		attachedChannels:
			settings.attachedChannels === null
				? null
				: [...new Set([...settings.attachedChannels, channel])].slice(
						0,
						MAX_SAVED_CHANNELS,
					),
		channels: {
			...settings.channels,
			[channel]: {
				...defaultChannelSettings(series[index], index),
				...appearance,
				visible: true,
			},
		},
	};
}
