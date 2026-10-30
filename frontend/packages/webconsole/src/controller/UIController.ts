import {
	isOperatingMode,
	TOPICS,
	type OperatingMode,
	type TopicReader,
	type TopicWriter,
	type Unsubscribe,
} from "./topics.ts";

/**
 * The only controller operations a frontend module needs for stand modes.
 * Neither this contract nor its implementation imports another UI module.
 */
export interface UIController {
	/** Read the latest stand report, or null if it is unavailable/invalid. */
	getReportedMode(): OperatingMode | null;
	/** Subscribe to mode reports; callback receives current state immediately. */
	subscribeToMode(onChange: (mode: OperatingMode | null) => void): Unsubscribe;
	/** Publish a request only. This is not an execution acknowledgment. */
	requestMode(mode: OperatingMode): void;
}

/**
 * Connects mode-aware UI modules to the shared topic transport.
 *
 * Important: Requests and reported modes are different topics. Publishing a
 * request does not change the reported mode, grant permission, or acknowledge
 * execution. The stand/backend remains responsible for safety interlocks.
 */
export class TopicUIController implements UIController {
	private readonly topics: TopicReader;
	private readonly commandWriter: TopicWriter;

	constructor(topics: TopicReader, commandWriter: TopicWriter) {
		this.topics = topics;
		this.commandWriter = commandWriter;
	}

	getReportedMode(): OperatingMode | null {
		return this.asReportedMode(this.topics.read(TOPICS.reportedMode));
	}

	subscribeToMode(onChange: (mode: OperatingMode | null) => void): Unsubscribe {
		return this.topics.subscribe(TOPICS.reportedMode, (value) => {
			onChange(this.asReportedMode(value));
		});
	}

	requestMode(mode: OperatingMode): void {
		if (!isOperatingMode(mode)) {
			throw new Error("Cannot request an unrecognized stand mode.");
		}

		// Intentionally does not publish to TOPICS.reportedMode.
		this.commandWriter.publish(TOPICS.requestedMode, mode);
	}

	/** Never turn missing or malformed reports into an assumed SAFE state. */
	private asReportedMode(value: unknown): OperatingMode | null {
		return isOperatingMode(value) ? value : null;
	}
}
