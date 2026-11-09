/** Per-channel table visibility; absent channels remain visible by default. */
export const TELEMETRY_SETTINGS_KEY = "river-dash-telemetry-overview-v1";
const MAX_SAVED_CHANNELS = 512;
const MAX_CHANNEL_NAME_LENGTH = 240;

export interface TelemetrySettings {
	channels: Record<string, boolean>;
}

export const DEFAULT_TELEMETRY_SETTINGS: TelemetrySettings = { channels: {} };

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isChannelName(name: string): boolean {
	return (
		name.length > 0 &&
		name.length <= MAX_CHANNEL_NAME_LENGTH &&
		!Array.from(name).some((character) => {
			const code = character.codePointAt(0) ?? 0;
			return code < 32 || code === 127;
		})
	);
}

/** Sanitize local storage and imported layout JSON before using channel keys. */
export function parseTelemetrySettings(value: unknown): TelemetrySettings {
	if (!isRecord(value) || !isRecord(value.channels)) {
		return { channels: {} };
	}
	const channels = Object.fromEntries(
		Object.entries(value.channels)
			.filter(
				([channel, visible]) =>
					isChannelName(channel) && typeof visible === "boolean",
			)
			.slice(0, MAX_SAVED_CHANNELS),
	) as Record<string, boolean>;
	return { channels };
}

export function isTelemetryChannelVisible(
	settings: TelemetrySettings,
	channel: string,
): boolean {
	return settings.channels[channel] !== false;
}

export function setTelemetryChannelVisibility(
	settings: TelemetrySettings,
	channel: string,
	visible: boolean,
): TelemetrySettings {
	if (!isChannelName(channel)) return settings;
	const channels = Object.fromEntries(
		Object.entries(settings.channels),
	) as Record<string, boolean>;
	if (visible) {
		delete channels[channel]; // Visible is the default for new channels.
	} else {
		Object.defineProperty(channels, channel, {
			value: false,
			enumerable: true,
			configurable: true,
			writable: true,
		});
	}
	return { channels };
}

export function setAllTelemetryChannelsVisible(
	settings: TelemetrySettings,
	channelNames: string[],
	visible: boolean,
): TelemetrySettings {
	if (visible) return { channels: {} }; // Clear stale hidden-channel overrides too.
	const channels = Object.fromEntries(
		Object.entries(settings.channels),
	) as Record<string, boolean>;
	for (const channel of channelNames) {
		if (isChannelName(channel))
			Object.defineProperty(channels, channel, {
				value: false,
				enumerable: true,
				configurable: true,
				writable: true,
			});
	}
	return { channels };
}

export function readTelemetrySettings(key = TELEMETRY_SETTINGS_KEY): TelemetrySettings {
	try {
		return parseTelemetrySettings(
			JSON.parse(localStorage.getItem(key) ?? "null"),
		);
	} catch {
		return { channels: {} };
	}
}

export function writeTelemetrySettings(settings: TelemetrySettings, key = TELEMETRY_SETTINGS_KEY): void {
	try {
		localStorage.setItem(
			key,
			JSON.stringify(parseTelemetrySettings(settings)),
		);
	} catch {
		// Browsers may block localStorage; keep the controls usable in memory.
	}
}
