/** Mock topic contracts. Confirm valve identifiers and payloads with stand/backend owners. */
export const TOPICS = {
  reportedMode: "stand/mode",
  requestedMode: "stand/mode/request",
  valveStates: "stand/valves",
  valveRequest: "stand/valves/request",
  commandResponse: "stand/commands/response",
} as const;

export const OPERATING_MODES = ["SAFE", "CHECKOUT", "OX_FILL", "PRESSURIZATION_FIRE"] as const;
export type OperatingMode = (typeof OPERATING_MODES)[number];
export function isOperatingMode(value: unknown): value is OperatingMode {
  return OPERATING_MODES.some((mode) => mode === value);
}

/** Demo identifiers, NOT validated against the physical stand's valve map. */
export const VALVES = [
  { id: "OX_FILL", label: "Ox fill" },
  { id: "OX_VENT", label: "Ox vent" },
  { id: "FUEL_RUN", label: "Fuel run" },
  { id: "OX_RUN", label: "Ox run" },
  { id: "PRESSURANT", label: "Pressurant" },
] as const;
export type ValveId = (typeof VALVES)[number]["id"];
export type ValveState = "OPEN" | "CLOSED" | "UNKNOWN";
export type ValveStates = Record<ValveId, ValveState>;
export type ValveCommand = { id: string; valve: ValveId; target: "OPEN" | "CLOSED" };
export type ModeCommand = { id: string; mode: OperatingMode };
export type CommandResponse = { id: string; accepted: boolean; message: string };
export function isValveId(value: string): value is ValveId {
  return VALVES.some((valve) => valve.id === value);
}

export type TopicValues = {
  [TOPICS.reportedMode]: OperatingMode;
  [TOPICS.requestedMode]: ModeCommand;
  [TOPICS.valveStates]: ValveStates;
  [TOPICS.valveRequest]: ValveCommand;
  [TOPICS.commandResponse]: CommandResponse;
};
export type TopicName = keyof TopicValues;
export type Unsubscribe = () => void;
/** The subscriber gets the latest snapshot immediately, even when undefined. */
export interface TopicReader {
  read<T extends TopicName>(topic: T): TopicValues[T] | undefined;
  subscribe<T extends TopicName>(topic: T, callback: (value: TopicValues[T] | undefined) => void): Unsubscribe;
}
export interface TopicWriter {
  publish<T extends TopicName>(topic: T, value: TopicValues[T]): void;
}
