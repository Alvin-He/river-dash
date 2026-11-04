import type { Unsubscribe } from "./topics";

export type EventKind = "REQUEST" | "RESPONSE" | "REPORT" | "SYSTEM";
export type EventSeverity = "info" | "warning" | "error";
export interface OperatorEvent {
	id: number;
	occurredAt: string;
	kind: EventKind;
	severity: EventSeverity;
	message: string;
	commandId?: string;
}
/**
 * Session-local operator log. Entries are immutable and capped to avoid
 * unbounded browser memory use. This is NOT the required persistent stand log.
 */
export class OperatorEventLog {
	private entries: OperatorEvent[] = [];
	private listeners = new Set<() => void>();
	private nextId = 1;
	private readonly limit = 500;

	/** Stable, read-only snapshot for React's useSyncExternalStore. */
	snapshot(): readonly OperatorEvent[] {
		return this.entries;
	}
	subscribe(listener: () => void): Unsubscribe {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	record(
		kind: EventKind,
		message: string,
		severity: EventSeverity = "info",
		commandId?: string,
	): void {
		const entry: OperatorEvent = {
			id: this.nextId++,
			occurredAt: new Date().toISOString(),
			kind,
			severity,
			message,
			commandId,
		};
		this.entries = [entry, ...this.entries].slice(0, this.limit);
		this.listeners.forEach((listener) => listener());
	}
}
