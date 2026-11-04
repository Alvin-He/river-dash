import { validateFireTiming, type FireTiming } from "./fireTiming";
import { canRequestValve, evaluateModeTransition } from "./modeRules";
import {
	isOperatingMode,
	isValveId,
	TOPICS,
	type MockCommandResponse,
	type OperatingMode,
	type TopicReader,
	type TopicWriter,
	type Unsubscribe,
	type ValveId,
	type ValveStates,
} from "./topics";
import type { OperatorEventLog } from "./OperatorEventLog";

// Retain the existing public export for modules that import from UIController.
export { canRequestValve } from "./modeRules";

/** A request awaiting a mock response or a separate reported state update. */
export type CommandActivity =
	| {
			id: string;
			kind: "MODE";
			target: OperatingMode;
			status: "SENT" | "ACCEPTED";
	  }
	| {
			id: string;
			kind: "VALVE";
			valve: ValveId;
			target: "OPEN" | "CLOSED";
			status: "SENT" | "ACCEPTED";
	  }
	| {
			id: string;
			kind: "FIRE";
			timing: FireTiming;
			status: "SENT" | "ACCEPTED";
	  };

/**
 * Recent lifecycle record for a single mock request.
 * REPORTED means a later matching topic value was observed; it is not proof
 * of physical execution or of causal connection to the command.
 */
export type CommandStatus =
	"SENT" | "ACCEPTED" | "REPORTED" | "REJECTED" | "SEND_FAILED";

export type CommandRecord =
	| {
			id: string;
			kind: "MODE";
			target: OperatingMode;
			status: CommandStatus;
			detail: string;
			updatedAt: string;
	  }
	| {
			id: string;
			kind: "VALVE";
			valve: ValveId;
			target: "OPEN" | "CLOSED";
			status: CommandStatus;
			detail: string;
			updatedAt: string;
	  }
	| {
			id: string;
			kind: "FIRE";
			timing: FireTiming;
			status: CommandStatus;
			detail: string;
			updatedAt: string;
	  };

/** UI modules depend on this interface, not the topic store or simulator. */
export interface UIController {
	getReportedMode(): OperatingMode | null;
	subscribeToMode(callback: (mode: OperatingMode | null) => void): Unsubscribe;
	getValveStates(): ValveStates | null;
	subscribeToValves(
		callback: (states: ValveStates | null) => void,
	): Unsubscribe;
	getCommandActivity(): readonly CommandActivity[];
	getCommandHistory(): readonly CommandRecord[];
	subscribeToCommandHistory(
		callback: (history: readonly CommandRecord[]) => void,
	): Unsubscribe;
	subscribeToCommandActivity(
		callback: (activity: readonly CommandActivity[]) => void,
	): Unsubscribe;
	requestMode(mode: OperatingMode): string;
	requestValve(valve: ValveId, target: "OPEN" | "CLOSED"): string;
	/** Browser mock only; never forwards Control::Fire to NILE hardware. */
	requestFire(timing: FireTiming): string;
}

/**
 * Transport-facing UI facade. A sent or accepted request does not change
 * reported mode or valve state. Only independent stand reports do that.
 * All frontend checks are advisory; real stand interlocks are external.
 */
export class TopicUIController implements UIController {
	private nextCommandId = 1;
	private readonly pending = new Map<string, CommandActivity>();
	private readonly history = new Map<string, CommandRecord>();
	private readonly historyListeners = new Set<
		(history: readonly CommandRecord[]) => void
	>();
	private readonly historyLimit = 100;
	private readonly activityListeners = new Set<
		(activity: readonly CommandActivity[]) => void
	>();

	private readonly reader: TopicReader;
	private readonly writer: TopicWriter;
	private readonly events: OperatorEventLog;

	constructor(
		reader: TopicReader,
		writer: TopicWriter,
		events: OperatorEventLog,
	) {
		this.reader = reader;
		this.writer = writer;
		this.events = events;
		reader.subscribe(TOPICS.reportedMode, (reported) => {
			// An observed report can correlate with one accepted request, but does
			// not establish that the request caused a hardware transition.
			const matchedId = this.observeMatchingReport(
				(request) => request.kind === "MODE" && request.target === reported,
			);
			events.record(
				"REPORT",
				`Stand mode report: ${reported ?? "UNAVAILABLE"}`,
				reported ? "info" : "warning",
				matchedId,
			);
		});
		reader.subscribe(TOPICS.valveStates, (states) => {
			if (states) {
				const matchedId = this.observeMatchingReport(
					(request) =>
						request.kind === "VALVE" &&
						states[request.valve] === request.target,
				);
				events.record(
					"REPORT",
					`Valve state report: ${Object.entries(states)
						.map(([id, value]) => `${id}=${value}`)
						.join(", ")}`,
					"info",
					matchedId,
				);
			} else {
				events.record("SYSTEM", "Valve state report unavailable", "warning");
			}
		});
		reader.subscribe(TOPICS.commandResponse, (response) => {
			if (response) this.recordResponse(response);
		});
	}

	getReportedMode(): OperatingMode | null {
		const reported = this.reader.read(TOPICS.reportedMode);
		return isOperatingMode(reported) ? reported : null;
	}

	subscribeToMode(callback: (mode: OperatingMode | null) => void): Unsubscribe {
		return this.reader.subscribe(TOPICS.reportedMode, (value) =>
			callback(isOperatingMode(value) ? value : null),
		);
	}

	getValveStates(): ValveStates | null {
		return this.reader.read(TOPICS.valveStates) ?? null;
	}

	subscribeToValves(
		callback: (states: ValveStates | null) => void,
	): Unsubscribe {
		return this.reader.subscribe(TOPICS.valveStates, (states) =>
			callback(states ?? null),
		);
	}

	getCommandActivity(): readonly CommandActivity[] {
		return [...this.pending.values()];
	}

	/** Newest first; retained only in this browser session (max 100). */
	getCommandHistory(): readonly CommandRecord[] {
		return [...this.history.values()].reverse();
	}

	subscribeToCommandHistory(
		callback: (history: readonly CommandRecord[]) => void,
	): Unsubscribe {
		this.historyListeners.add(callback);
		callback(this.getCommandHistory());
		return () => {
			this.historyListeners.delete(callback);
		};
	}

	subscribeToCommandActivity(
		callback: (activity: readonly CommandActivity[]) => void,
	): Unsubscribe {
		this.activityListeners.add(callback);
		callback(this.getCommandActivity());
		return () => {
			this.activityListeners.delete(callback);
		};
	}

	requestMode(mode: OperatingMode): string {
		if (!isOperatingMode(mode)) throw new Error("Unrecognized stand mode");
		const assessment = evaluateModeTransition(
			this.getReportedMode(),
			mode,
			this.getValveStates(),
		);
		if (!assessment.eligible) {
			const reason = assessment.reasons.join("; ");
			this.events.record("SYSTEM", `Mode request not sent: ${reason}`, "info");
			throw new Error(reason);
		}
		const id = this.commandId();
		this.events.record(
			"REQUEST",
			`Mode change requested: ${mode} (not confirmed)`,
			"info",
			id,
		);
		this.sendTracked({ id, kind: "MODE", target: mode, status: "SENT" }, () =>
			this.writer.publish(TOPICS.requestedMode, { id, mode }),
		);
		return id;
	}

	requestValve(valve: ValveId, target: "OPEN" | "CLOSED"): string {
		if (!isValveId(valve) || (target !== "OPEN" && target !== "CLOSED")) {
			throw new Error("Invalid valve request");
		}
		if (!canRequestValve(this.getReportedMode(), valve)) {
			throw new Error("Valve control unavailable in current mode");
		}
		const id = this.commandId();
		this.events.record(
			"REQUEST",
			`${valve}: ${target} requested (not confirmed)`,
			"info",
			id,
		);
		this.sendTracked({ id, kind: "VALVE", valve, target, status: "SENT" }, () =>
			this.writer.publish(TOPICS.valveRequest, { id, valve, target }),
		);
		return id;
	}

	/**
	 * Submit a typed FIRE request to the in-memory simulator ONLY. This does not
	 * issue a real NILE `Control::Fire` command or start any firing sequence.
	 */
	requestFire(timing: FireTiming): string {
		const errors = validateFireTiming(timing);
		if (errors.length > 0) throw new Error(errors.join("; "));
		if (this.getReportedMode() !== "PRESSURIZATION_FIRE") {
			throw new Error(
				"Mock Fire request available only in reported PRESSURIZATION_FIRE mode",
			);
		}
		const id = this.commandId();
		this.events.record(
			"REQUEST",
			`Mock Fire timing request: burn=${timing.burn_time_micros}µs, ignition offset=${timing.ignition_offset_micros}µs, propellant offset=${timing.propellants_offset_micros}µs (no hardware)`,
			"info",
			id,
		);
		this.sendTracked(
			{ id, kind: "FIRE", timing: { ...timing }, status: "SENT" },
			() => this.writer.publish(TOPICS.fireRequest, { id, ...timing }),
		);
		return id;
	}

	private commandId(): string {
		return `demo-${this.nextCommandId++}`;
	}

	/** Register an individual request before publishing it to the mock topic. */
	private sendTracked(request: CommandActivity, publish: () => void): void {
		this.pending.set(request.id, request);
		this.updateHistory(request, "SENT", "Request published to mock transport");
		this.notifyActivity();
		try {
			publish();
		} catch (error) {
			this.pending.delete(request.id);
			const reason = error instanceof Error ? error.message : String(error);
			this.updateHistory(request, "SEND_FAILED", reason);
			this.events.record(
				"SYSTEM",
				`Request could not be published: ${reason}`,
				"error",
				request.id,
			);
			this.notifyActivity();
			throw error;
		}
	}

	private recordResponse(response: MockCommandResponse): void {
		const activity = this.pending.get(response.id);
		if (activity) {
			if (response.accepted) {
				// FIRE has no reported-state topic in this mock. A response is its
				// terminal simulator outcome, not confirmation of a real firing.
				if (activity.kind === "FIRE") this.pending.delete(response.id);
				else this.pending.set(response.id, { ...activity, status: "ACCEPTED" });
				this.updateHistory(activity, "ACCEPTED", response.message);
			} else {
				this.pending.delete(response.id);
				this.updateHistory(activity, "REJECTED", response.message);
			}
			this.notifyActivity();
		}
		this.events.record(
			"RESPONSE",
			`${response.accepted ? "Accepted" : "Rejected"}: ${response.message}`,
			response.accepted ? "info" : "error",
			response.id,
		);
	}

	/**
	 * Match only the oldest accepted request, never all similar requests. Topic
	 * reports have no request ID, so the match is informational, not causal.
	 */
	private observeMatchingReport(
		matches: (request: CommandActivity) => boolean,
	): string | undefined {
		for (const request of this.pending.values()) {
			if (request.status !== "ACCEPTED" || !matches(request)) continue;
			this.pending.delete(request.id);
			this.updateHistory(
				request,
				"REPORTED",
				"Later matching mock topic report observed (not physical confirmation)",
			);
			this.notifyActivity();
			return request.id;
		}
		return undefined;
	}

	/** Keep the most recent 100 outcomes, notifying controls on every change. */
	private updateHistory(
		activity: CommandActivity,
		status: CommandRecord["status"],
		detail: string,
	): void {
		const record: CommandRecord = {
			...activity,
			status,
			detail,
			updatedAt: new Date().toISOString(),
		};
		this.history.delete(activity.id);
		this.history.set(activity.id, record);
		if (this.history.size > this.historyLimit) {
			const oldestId = this.history.keys().next().value;
			if (oldestId !== undefined) this.history.delete(oldestId);
		}
		const snapshot = this.getCommandHistory();
		for (const listener of [...this.historyListeners]) listener(snapshot);
	}

	private notifyActivity(): void {
		const snapshot = this.getCommandActivity();
		for (const listener of [...this.activityListeners]) listener(snapshot);
	}
}
