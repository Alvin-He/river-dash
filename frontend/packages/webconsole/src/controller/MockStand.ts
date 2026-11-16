import { canRequestValve, evaluateModeTransition } from "./modeRules";
import { validateFireTiming } from "./fireTiming";
import {
	TOPICS,
	VALVES,
	type MockCommandResponse,
	type FireCommand,
	type ModeCommand,
	type OperatingMode,
	type TopicReader,
	type TopicWriter,
	type Unsubscribe,
	type ValveCommand,
	type ValveId,
	type ValveState,
	type ValveStates,
} from "./topics";

/** A simulated operator request, not a physical stand command. */
export type PendingMockRequest =
	| ({ kind: "MODE" } & ModeCommand)
	| ({ kind: "VALVE" } & ValveCommand)
	| ({ kind: "FIRE" } & FireCommand);

/** An accepted mock mode request awaiting a separate simulated mode report. */
export type AcceptedMockMode = Pick<ModeCommand, "id" | "mode">;
/** An accepted mock valve command awaiting a distinct simulated report. */
export type AcceptedMockValve = Pick<ValveCommand, "id" | "valve" | "target">;

/** Separate timers make mock acceptance and mock telemetry distinguishable in the UI. */
const AUTO_STEP_DELAY_MS = 120;

export interface MockStandOptions {
	/** Automatically generate mock responses and subsequent simulated reports. */
	autoProcess?: boolean;
}

type MockTopics = TopicReader &
	TopicWriter & {
		clear(topic: typeof TOPICS.reportedMode | typeof TOPICS.valveStates): void;
	};

export interface StandSimulator {
	isAutoProcessing(): boolean;
	setAutoProcessing(enabled: boolean): void;
	reportMode(mode: OperatingMode): void;
	clearReportedMode(): void;
	reportValve(valve: ValveId, state: ValveState): void;
	clearValveReports(): void;
	getPendingRequests(): readonly PendingMockRequest[];
	getAcceptedModeReports(): readonly AcceptedMockMode[];
	getAcceptedValveReports(): readonly AcceptedMockValve[];
	subscribeToQueue(listener: () => void): Unsubscribe;
	/** Evaluate the next mock request, or force a mock rejection. Never changes reported state. */
	respondToPending(shouldAccept: boolean): MockCommandResponse | null;
	/** Publish a simulated stand report for an already accepted mode request. */
	publishAcceptedModeReport(): AcceptedMockMode | null;
	/** Publish a *separate* mock valve telemetry update for one accepted command. */
	publishAcceptedValveReport(): AcceptedMockValve | null;
}

/**
 * Development-only stand simulator. Not a hardware driver or stand interlock.
 *
 * Topic requests are queued in arrival order, with SAFE mode requests evaluated
 * first. Processing a request emits exactly one response. A positive response
 * DOES NOT itself mutate reported mode or valve state. In automatic demo mode,
 * a later timer publishes a *simulated* report; in manual mode an operator
 * must explicitly publish it. Neither path represents physical feedback.
 */
export class MockStand implements StandSimulator {
	private readonly topics: MockTopics;
	private readonly requests: PendingMockRequest[] = [];
	private readonly acceptedModes: AcceptedMockMode[] = [];
	private readonly acceptedValves: AcceptedMockValve[] = [];
	private readonly seenIds = new Set<string>();
	private readonly queueListeners = new Set<() => void>();
	private readonly unsubscribeRequests: Unsubscribe[];
	private autoProcessing: boolean;
	private autoTimer: ReturnType<typeof setTimeout> | null = null;
	private disposed = false;

	constructor(topics: MockTopics, options: MockStandOptions = {}) {
		this.topics = topics;
		this.autoProcessing = options.autoProcess ?? false;
		// Subscriptions receive the last snapshot on registration. Deduplicate by
		// unique demo request ID so a replay cannot enqueue the same request twice.
		this.unsubscribeRequests = [
			topics.subscribe(TOPICS.requestedMode, (command) => {
				if (command) this.enqueue({ ...command, kind: "MODE" });
			}),
			topics.subscribe(TOPICS.valveRequest, (command) => {
				if (command) this.enqueue({ ...command, kind: "VALVE" });
			}),
			topics.subscribe(TOPICS.fireRequest, (command) => {
				if (command) this.enqueue({ ...command, kind: "FIRE" });
			}),
		];
	}

	isAutoProcessing(): boolean {
		return this.autoProcessing;
	}

	/** Switch between a realistic one-click demo and manual failure testing. */
	setAutoProcessing(enabled: boolean): void {
		if (this.disposed || this.autoProcessing === enabled) return;
		this.autoProcessing = enabled;
		if (!enabled && this.autoTimer !== null) {
			clearTimeout(this.autoTimer);
			this.autoTimer = null;
		}
		this.notifyQueue();
	}

	/** Direct mock telemetry injection; intentionally bypasses transition rules. */
	reportMode(mode: OperatingMode): void {
		this.topics.publish(TOPICS.reportedMode, mode);
	}

	clearReportedMode(): void {
		this.topics.clear(TOPICS.reportedMode);
	}

	reportValve(valve: ValveId, state: ValveState): void {
		const current = this.topics.read(TOPICS.valveStates) ?? this.emptyValves();
		this.topics.publish(TOPICS.valveStates, { ...current, [valve]: state });
	}

	clearValveReports(): void {
		this.topics.clear(TOPICS.valveStates);
	}

	getPendingRequests(): readonly PendingMockRequest[] {
		return [...this.requests];
	}

	getAcceptedModeReports(): readonly AcceptedMockMode[] {
		return [...this.acceptedModes];
	}

	getAcceptedValveReports(): readonly AcceptedMockValve[] {
		return [...this.acceptedValves];
	}

	subscribeToQueue(listener: () => void): Unsubscribe {
		this.queueListeners.add(listener);
		listener();
		return () => this.queueListeners.delete(listener);
	}

	/**
	 * Handle one queued request. This deliberately repeats the frontend policy
	 * check against the LATEST mock reports, so changing reports after a button
	 * click can still produce a rejection. Rejection is always available for
	 * testing. SAFE bypasses ordinary requirements but has no physical effect.
	 */
	respondToPending(shouldAccept: boolean): MockCommandResponse | null {
		const index = this.nextRequestIndex();
		if (index < 0) return null;

		const [command] = this.requests.splice(index, 1);
		const reason = shouldAccept
			? this.rejectionReason(command)
			: "Simulated stand rejection";
		const accepted = reason === null;
		const response: MockCommandResponse = {
			id: command.id,
			accepted,
			message: accepted
				? command.kind === "FIRE"
					? "Mock Fire request acknowledged; NO firing sequence executed"
					: `Mock accepted ${this.describe(command)}; no stand state changed`
				: `Mock rejected ${this.describe(command)}: ${reason}`,
		};

		if (
			accepted &&
			command.kind === "MODE" &&
			command.mode === "SAFE" &&
			this.autoProcessing
		) {
			// A new mock SAFE report must not be followed by stale accepted
			// normal-mode or valve reports. Cancel those simulated requests.
			this.cancelSupersededBySafe();
		}
		if (accepted && command.kind === "MODE") {
			// Acknowledgment merely makes a separate report available.
			this.acceptedModes.push({ id: command.id, mode: command.mode });
		}
		if (accepted && command.kind === "VALVE") {
			this.acceptedValves.push({
				id: command.id,
				valve: command.valve,
				target: command.target,
			});
		}
		this.topics.publish(TOPICS.commandResponse, response);
		this.notifyQueue();
		return response;
	}

	/**
	 * Model a separate stand-originated report for the oldest accepted mode.
	 * In auto-demo mode a later timer invokes this method. Otherwise an operator
	 * invokes it manually. Neither case proves that real hardware changed mode.
	 */
	publishAcceptedModeReport(): AcceptedMockMode | null {
		const accepted = this.acceptedModes.shift();
		if (!accepted) return null;
		this.reportMode(accepted.mode);
		this.notifyQueue();
		return accepted;
	}

	/**
	 * Publish a fabricated stand-originated valve report in the browser simulator.
	 * Auto-demo calls this on a later tick; manual mode requires an operator click.
	 * The report is not independently measured physical feedback.
	 */
	publishAcceptedValveReport(): AcceptedMockValve | null {
		const accepted = this.acceptedValves.shift();
		if (!accepted) return null;
		this.reportValve(accepted.valve, accepted.target);
		this.notifyQueue();
		return accepted;
	}

	/** Remove subscriptions when a mock instance is discarded (e.g. in tests). */
	dispose(): void {
		this.disposed = true;
		if (this.autoTimer !== null) clearTimeout(this.autoTimer);
		this.autoTimer = null;
		for (const unsubscribe of this.unsubscribeRequests) unsubscribe();
		this.queueListeners.clear();
	}

	/**
	 * Auto-demo processes one step per timer tick. Request -> response -> report
	 * are separate publications, never a single optimistic state mutation.
	 * A SAFE request takes priority, including over deferred normal reports.
	 */
	private scheduleAutoStep(): void {
		if (
			this.disposed ||
			!this.autoProcessing ||
			this.autoTimer !== null ||
			(this.requests.length === 0 &&
				this.acceptedModes.length === 0 &&
				this.acceptedValves.length === 0)
		)
			return;

		this.autoTimer = setTimeout(() => {
			this.autoTimer = null;
			if (this.disposed || !this.autoProcessing) return;

			const safeRequest = this.requests.some(
				(request) => request.kind === "MODE" && request.mode === "SAFE",
			);
			if (safeRequest) {
				this.respondToPending(true);
			} else if (this.acceptedModes.length > 0) {
				this.publishAcceptedModeReport();
			} else if (this.acceptedValves.length > 0) {
				this.publishAcceptedValveReport();
			} else if (this.requests.length > 0) {
				this.respondToPending(true);
			}
			this.scheduleAutoStep();
		}, AUTO_STEP_DELAY_MS);
	}

	/** In auto-demo only, SAFE invalidates older unreported mock work. */
	private cancelSupersededBySafe(): void {
		const canceled = [
			...this.acceptedModes,
			...this.acceptedValves,
			...this.requests,
		];
		this.acceptedModes.length = 0;
		this.acceptedValves.length = 0;
		this.requests.length = 0;
		for (const request of canceled) {
			this.topics.publish(TOPICS.commandResponse, {
				id: request.id,
				accepted: false,
				message: "Mock request superseded by SAFE",
			});
		}
	}

	private enqueue(command: PendingMockRequest): void {
		if (this.seenIds.has(command.id)) return;
		this.seenIds.add(command.id);
		this.requests.push(command);
		this.notifyQueue();
	}

	private nextRequestIndex(): number {
		// A SAFE request must not wait behind ordinary mock requests.
		const safe = this.requests.findIndex(
			(request) => request.kind === "MODE" && request.mode === "SAFE",
		);
		return safe >= 0 ? safe : this.requests.length > 0 ? 0 : -1;
	}

	private rejectionReason(command: PendingMockRequest): string | null {
		const mode = this.topics.read(TOPICS.reportedMode) ?? null;
		if (command.kind === "MODE") {
			const result = evaluateModeTransition(
				mode,
				command.mode,
				this.topics.read(TOPICS.valveStates) ?? null,
			);
			return result.eligible ? null : result.reasons.join("; ");
		}
		if (command.kind === "FIRE") {
			if (mode !== "PRESSURIZATION_FIRE") {
				return `Mock Fire request unavailable in reported mode ${mode ?? "UNKNOWN"}`;
			}
			const errors = validateFireTiming(command);
			return errors.length > 0 ? errors.join("; ") : null;
		}
		return canRequestValve(mode, command.valve)
			? null
			: `Valve ${command.valve} is unavailable in reported mode ${mode ?? "UNKNOWN"}`;
	}

	private describe(command: PendingMockRequest): string {
		switch (command.kind) {
			case "MODE":
				return `mode ${command.mode}`;
			case "VALVE":
				return `valve ${command.valve} ${command.target}`;
			case "FIRE":
				return "simulated Fire timing request";
		}
	}

	private emptyValves(): ValveStates {
		return Object.fromEntries(
			VALVES.map(({ id }) => [id, "UNKNOWN"]),
		) as ValveStates;
	}

	private notifyQueue(): void {
		for (const listener of [...this.queueListeners]) listener();
		this.scheduleAutoStep();
	}
}
