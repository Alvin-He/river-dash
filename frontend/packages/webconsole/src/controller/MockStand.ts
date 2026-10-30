import { TOPICS, type OperatingMode, type TopicWriter } from "./topics.ts";

/** Development-only interface for simulating reports originating outside the UI Controller. */
export interface StandSimulator {
	reportMode(mode: OperatingMode): void;
	clearReportedMode(): void;
}

/** Separate publisher: UI requests cannot directly alter reported stand state. */
export class MockStand implements StandSimulator {
	private readonly topics: TopicWriter & { clear(topic: typeof TOPICS.reportedMode): void };

	constructor(topics: TopicWriter & { clear(topic: typeof TOPICS.reportedMode): void }) {
		this.topics = topics;
	}

	/** Simulate the stand publishing an authoritative report. */
	reportMode(mode: OperatingMode): void {
		this.topics.publish(TOPICS.reportedMode, mode);
	}

	/** Simulate losing the report (the UI must show UNKNOWN, not SAFE). */
	clearReportedMode(): void {
		this.topics.clear(TOPICS.reportedMode);
	}
}
