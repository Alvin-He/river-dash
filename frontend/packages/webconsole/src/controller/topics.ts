/**
 * Temporary topic names for the mock integration.
 * Confirm the names and payloads with the global_data_table PR before connecting
 * to a real stand.
 */
export const TOPICS = {
	reportedMode: "stand/mode",
	requestedMode: "stand/mode/request",
} as const;

/** Mode identifiers shared by the mock request and report topics. */
export const OPERATING_MODES = [
	"SAFE",
	"CHECKOUT",
	"OX_FILL",
	"PRESSURIZATION_FIRE",
] as const;

export type OperatingMode = (typeof OPERATING_MODES)[number];

/** Validate external runtime data; TypeScript types alone do not validate network input. */
export function isOperatingMode(value: unknown): value is OperatingMode {
	return OPERATING_MODES.some((mode) => mode === value);
}

/** Single source of truth for the type carried by each topic. */
export type TopicValues = {
	[TOPICS.reportedMode]: OperatingMode;
	[TOPICS.requestedMode]: OperatingMode;
};

export type TopicName = keyof TopicValues;

/** Call when a UI subscriber unmounts; repeated calls should be harmless. */
export type Unsubscribe = () => void;

/**
 * A subscription emits the latest value immediately, including undefined when
 * the topic has no data. Later updates are delivered to every subscriber.
 * Implementations must preserve this contract for late-mounting modules.
 */
export interface TopicReader {
	read<T extends TopicName>(topic: T): TopicValues[T] | undefined;
	subscribe<T extends TopicName>(
		topic: T,
		onUpdate: (value: TopicValues[T] | undefined) => void,
	): Unsubscribe;
}

/** Publishers are separated from readers to limit write privileges. */
export interface TopicWriter {
	publish<T extends TopicName>(topic: T, value: TopicValues[T]): void;
}
