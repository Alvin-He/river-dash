/** Mock topic contracts. Valve IDs match nile-common; topic payloads remain demo-only. */
export const TOPICS = {
	reportedMode: "stand/mode",
	requestedMode: "stand/mode/request",
	valveStates: "stand/valves",
	valveRequest: "stand/valves/request",
	commandResponse: "stand/commands/response",
	/** Development-only request, never bridged to a physical Control::Fire. */
	fireRequest: "stand/fire/request/mock",
} as const;

export const OPERATING_MODES = [
	"SAFE",
	"CHECKOUT",
	"OX_FILL",
	"PRESSURIZATION_FIRE",
] as const;
export type OperatingMode = (typeof OPERATING_MODES)[number];
export function isOperatingMode(value: unknown): value is OperatingMode {
	return OPERATING_MODES.some((mode) => mode === value);
}

// Canonical valve identifiers from nile-common (see valves.ts).
export { VALVES, isValveId } from "./valves";
export type { ValveId } from "./valves";
import type { ValveId } from "./valves";
import type { FireTiming } from "./fireTiming";

export type ValveState = "OPEN" | "CLOSED" | "UNKNOWN";
export type ValveStates = Record<ValveId, ValveState>;
export type ValveCommand = {
	id: string;
	valve: ValveId;
	target: "OPEN" | "CLOSED";
};
export type ModeCommand = { id: string; mode: OperatingMode };
export type FireCommand = { id: string } & FireTiming;
export type CommandResponse = {
	id: string;
	accepted: boolean;
	message: string;
};
export type TopicValues = {
	[TOPICS.reportedMode]: OperatingMode;
	[TOPICS.requestedMode]: ModeCommand;
	[TOPICS.valveStates]: ValveStates;
	[TOPICS.valveRequest]: ValveCommand;
	[TOPICS.fireRequest]: FireCommand;
	[TOPICS.commandResponse]: CommandResponse;
};
export type TopicName = keyof TopicValues;
export type Unsubscribe = () => void;
/** The subscriber gets the latest snapshot immediately, even when undefined. */
export interface TopicReader {
	read<T extends TopicName>(topic: T): TopicValues[T] | undefined;
	subscribe<T extends TopicName>(
		topic: T,
		callback: (value: TopicValues[T] | undefined) => void,
	): Unsubscribe;
}
export interface TopicWriter {
	publish<T extends TopicName>(topic: T, value: TopicValues[T]): void;
}
