import type {
	TopicName,
	TopicReader,
	TopicValues,
	TopicWriter,
	Unsubscribe,
} from "./topics.ts";

type Listener = (value: TopicValues[TopicName] | undefined) => void;

/**
 * In-memory mock of GDT's topic subscription behavior.
 * The mock is local to one page. It is NOT a hardware or network transport.
 */
export class MockTopicStore implements TopicReader, TopicWriter {
	// Each topic retains its last published value for newly mounted subscribers.
	private readonly values = new Map<TopicName, TopicValues[TopicName]>();
	// A Set allows multiple independent subscribers per topic.
	private readonly listeners = new Map<TopicName, Set<Listener>>();

	/** Return the current snapshot, or undefined before the first report. */
	read<T extends TopicName>(topic: T): TopicValues[T] | undefined {
		return this.values.get(topic) as TopicValues[T] | undefined;
	}

	/** Return a cleanup callback; subscriptions never outlive their consumers. */
	subscribe<T extends TopicName>(
		topic: T,
		onUpdate: (value: TopicValues[T] | undefined) => void,
	): Unsubscribe {
		const listeners = this.listeners.get(topic) ?? new Set<Listener>();
		this.listeners.set(topic, listeners);
		const listener = onUpdate as Listener;
		listeners.add(listener);

		// Subscribe first, then replay the snapshot so late-mounted modules work.
		onUpdate(this.read(topic));

		return () => {
			listeners.delete(listener);
			if (listeners.size === 0) this.listeners.delete(topic);
		};
	}

	/** Publish a simulated value and synchronously notify subscribers. */
	publish<T extends TopicName>(topic: T, value: TopicValues[T]): void {
		this.values.set(topic, value);
		this.notify(topic, value);
	}

	/** Simulates an unavailable topic or disconnected stand in the demo UI. */
	clear(topic: TopicName): void {
		this.values.delete(topic);
		this.notify(topic, undefined);
	}

	private notify(topic: TopicName, value: TopicValues[TopicName] | undefined): void {
		// Snapshot prevents changes to the listener set disrupting this update.
		for (const listener of [...(this.listeners.get(topic) ?? [])]) {
			listener(value);
		}
	}
}
