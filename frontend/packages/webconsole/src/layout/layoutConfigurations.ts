import {
	parseTelemetrySettings,
	type TelemetrySettings,
} from "../modules/telemetry/telemetrySettings";
import {
	parseGraphSettings,
	type GraphSettings,
} from "../modules/time-series-graph/graphSettings";
import {
	MIN_SURFACE_WIDTH,
	repeatableModuleKind,
	parseSavedLayout,
	type DashboardLayout,
} from "./dashboardLayout";

/** Browser-local named layouts are separate from the current auto-saved layout. */
export const LAYOUT_CONFIGURATIONS_KEY = "river-dash-layout-configurations-v1";
export const MAX_LAYOUT_CONFIGURATIONS = 30;
export const MAX_LAYOUT_IMPORT_BYTES = 128 * 1024;
const MAX_LAYOUT_NAME_LENGTH = 48;
const MAX_REFERENCE_WIDTH = 100000;
const MAX_LAYOUT_COORDINATE = 250000;

export interface LayoutSnapshot {
	version: 1;
	layout: DashboardLayout;
	referenceWidth: number;
	/** Optional for backwards compatibility with geometry-only saved layouts. */
	graphSettings?: GraphSettings;
	/** Optional for older layout JSON; absent preserves current telemetry choices. */
	telemetrySettings?: TelemetrySettings;
	/** Per-instance graph and telemetry preferences, keyed by module ID. */
	moduleSettings?: Record<string, GraphSettings | TelemetrySettings>;
}

export interface LayoutConfiguration {
	id: string;
	name: string;
	savedAt: string;
	snapshot: LayoutSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeLayoutName(input: string): string {
	const name = input.trim().replace(/\s+/g, " ");
	if (!name) throw new Error("Enter a name for this layout.");
	if (name.length > MAX_LAYOUT_NAME_LENGTH) {
		throw new Error(
			`Layout names must be ${MAX_LAYOUT_NAME_LENGTH} characters or fewer.`,
		);
	}
	if (
		[...name].some((character) => {
			const code = character.codePointAt(0) ?? 0;
			return code < 32 || code === 127;
		})
	)
		throw new Error("Layout name contains invalid characters.");
	return name;
}

/** Verify imported/persisted geometry before it can replace the running dashboard. */
export function parseLayoutSnapshot(value: unknown): LayoutSnapshot | null {
	if (!isRecord(value)) return null;
	const layout = parseSavedLayout(value);
	const referenceWidth = value.referenceWidth;
	if (
		!layout ||
		typeof referenceWidth !== "number" ||
		!Number.isFinite(referenceWidth) ||
		referenceWidth < MIN_SURFACE_WIDTH ||
		referenceWidth > MAX_REFERENCE_WIDTH
	)
		return null;

	const panels = Object.values(layout);
	if (
		panels.some(
			(p) =>
				p.x + p.width > referenceWidth + 0.001 ||
				p.y + p.height > MAX_LAYOUT_COORDINATE ||
				p.width > MAX_REFERENCE_WIDTH,
		)
	)
		return null;
	// The original default arrangement has gaps below the current 16px snap gap.
	// Reject actual overlap but don't invalidate otherwise usable older presets.
	for (let i = 0; i < panels.length; i++) {
		for (let j = i + 1; j < panels.length; j++) {
			const a = panels[i],
				b = panels[j];
			if (
				a.x < b.x + b.width &&
				a.x + a.width > b.x &&
				a.y < b.y + b.height &&
				a.y + a.height > b.y
			)
				return null;
		}
	}
	if ("graphSettings" in value && !isRecord(value.graphSettings)) return null;
	if ("telemetrySettings" in value && !isRecord(value.telemetrySettings))
		return null;
	let moduleSettings: LayoutSnapshot["moduleSettings"];
	if ("moduleSettings" in value) {
		if (!isRecord(value.moduleSettings)) return null;
		moduleSettings = {};
		for (const [id, rawSettings] of Object.entries(value.moduleSettings)) {
			const kind = repeatableModuleKind(id);
			if (!kind || !Object.hasOwn(layout, id) || !isRecord(rawSettings)) return null;
			moduleSettings[id] = kind === "graphs" ? parseGraphSettings(rawSettings) : parseTelemetrySettings(rawSettings);
		}
	}
	return {
		version: 1,
		layout,
		referenceWidth,
		...(moduleSettings ? { moduleSettings } : {}),
		...(isRecord(value.graphSettings)
			? { graphSettings: parseGraphSettings(value.graphSettings) }
			: {}),
		...(isRecord(value.telemetrySettings)
			? { telemetrySettings: parseTelemetrySettings(value.telemetrySettings) }
			: {}),
	};
}

function parseConfiguration(value: unknown): LayoutConfiguration | null {
	if (
		!isRecord(value) ||
		typeof value.name !== "string" ||
		typeof value.savedAt !== "string" ||
		typeof value.id !== "string"
	)
		return null;
	try {
		const name = normalizeLayoutName(value.name);
		if (
			value.id !== name.toLocaleLowerCase("en-US") ||
			!Number.isFinite(Date.parse(value.savedAt))
		)
			return null;
		const snapshot = parseLayoutSnapshot(value.snapshot);
		return snapshot
			? { id: value.id, name, savedAt: value.savedAt, snapshot }
			: null;
	} catch {
		return null;
	}
}

export function readLayoutConfigurations(): LayoutConfiguration[] {
	try {
		const parsed: unknown = JSON.parse(
			localStorage.getItem(LAYOUT_CONFIGURATIONS_KEY) ?? "null",
		);
		if (
			!isRecord(parsed) ||
			parsed.version !== 1 ||
			!Array.isArray(parsed.items)
		)
			return [];
		const unique = new Set<string>();
		const result: LayoutConfiguration[] = [];
		for (const item of parsed.items.slice(0, MAX_LAYOUT_CONFIGURATIONS)) {
			const configuration = parseConfiguration(item);
			if (configuration && !unique.has(configuration.id)) {
				result.push(configuration);
				unique.add(configuration.id);
			}
		}
		return result;
	} catch {
		return [];
	}
}

export function writeLayoutConfigurations(items: LayoutConfiguration[]): void {
	try {
		localStorage.setItem(
			LAYOUT_CONFIGURATIONS_KEY,
			JSON.stringify({ version: 1, items }),
		);
	} catch {
		throw new Error(
			"Couldn't save layouts in this browser. Check storage permissions or free space.",
		);
	}
}

export function addLayoutConfiguration(
	existing: LayoutConfiguration[],
	nameInput: string,
	snapshotInput: unknown,
): LayoutConfiguration[] {
	const name = normalizeLayoutName(nameInput);
	const id = name.toLocaleLowerCase("en-US");
	if (existing.some((item) => item.id === id)) {
		throw new Error(
			`A layout named “${name}” already exists. Choose another name.`,
		);
	}
	if (existing.length >= MAX_LAYOUT_CONFIGURATIONS) {
		throw new Error(
			`You can save up to ${MAX_LAYOUT_CONFIGURATIONS} layouts. Delete one first.`,
		);
	}
	const snapshot = parseLayoutSnapshot(snapshotInput);
	if (!snapshot)
		throw new Error("This layout has invalid or unsupported module positions.");
	return [
		...existing,
		{ id, name, savedAt: new Date().toISOString(), snapshot },
	];
}

/** Export is a portable single-layout file, not all browser-local preferences. */
export function serializeLayoutConfiguration(
	item: LayoutConfiguration,
): string {
	return JSON.stringify(
		{
			format: "river-dash-layout",
			version: 1,
			name: item.name,
			referenceWidth: item.snapshot.referenceWidth,
			layout: item.snapshot.layout,
			...(item.snapshot.moduleSettings ? { moduleSettings: item.snapshot.moduleSettings } : {}),
			...(item.snapshot.graphSettings
				? { graphSettings: item.snapshot.graphSettings }
				: {}),
			...(item.snapshot.telemetrySettings
				? { telemetrySettings: item.snapshot.telemetrySettings }
				: {}),
		},
		null,
		2,
	);
}

export function parseImportedLayoutConfiguration(text: string): {
	name: string;
	snapshot: LayoutSnapshot;
} {
	if (new Blob([text]).size > MAX_LAYOUT_IMPORT_BYTES)
		throw new Error("Layout file exceeds 128 KB.");
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error("This file isn't valid JSON.");
	}
	if (
		!isRecord(parsed) ||
		parsed.format !== "river-dash-layout" ||
		parsed.version !== 1 ||
		typeof parsed.name !== "string"
	) {
		throw new Error("Unsupported layout file format or version.");
	}
	const name = normalizeLayoutName(parsed.name);
	const snapshot = parseLayoutSnapshot(parsed);
	if (!snapshot)
		throw new Error(
			"Layout file contains invalid or incomplete module geometry.",
		);
	return { name, snapshot };
}
