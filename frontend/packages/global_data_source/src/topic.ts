import "temporal-polyfill/global";
import type { Any } from "./types.ts";

//
// Interface Declarations
//

/**
 * Modes a topic can be opened under
 */
export enum TopicOpenMode {
	Read = "R",
	ReadWrite = "RW",
	ReadWriteMany = "RWM",
}

/**
 * This is the base interface for a Topic. A topic is a reference to a data stream  
 *  from the global data table.
 */
export interface TopicBase<_Data> {
	/**
	 * Gets the name of this Topic. The name is unique or undefined behavior if not.
	 */
	get_name(): string;
}

/**
 * This interface defines the Read trait for a Topic. All topics with a read trait
 *  can be read from using functions defined in this interface.  
 *
 * This interface extends {@link TopicBase} and {@link EventTarget}
 */
export interface TopicTraitRead<Data> extends TopicBase<Data>, EventTarget {
	/**
	 * Returns weather or not this topic has new data.
	 *
	 */
	has_data(): boolean;
	/**
	 * Reads data from this Topic. This data may be stale since the Topic was last
	 *  updated.  
	 *
	 * Get staleness using {@link TopicTraitRead.get_last_update_time}.
	 */
	read_data(): Data;
	/**
	 * Tries to read new data. New data is available after this Topic has been updated
	 *  since the last call to {@link read_data()} or {@link try_read_new_data()} or
	 *  {@link read_new_data_async()}  
	 *
	 * @returns Data if new data is available
	 * @returns null if new data is un-available
	 */
	try_read_new_data(): Data | null;
	/**
	 * Async version of {@link try_read_new_data()}. Returns a Promise that blocks
	 *  until new data is available.
	 *
	 * @warning **This MAY block indefinitely if topic is not being updated.**
	 */
	read_new_data_async(): Promise<Data>;

	/**
	 * Gets the last updated time of this Topic.
	 *
	 * @warning **This time is based on the publisher's time reference point. DO NOT compare
	 *  this against the system time or another instant if they are not from the same time
	 *  reference.**
	 */
	get_last_update_time(): Temporal.Instant;

	/**
	 * Gets the time since last update of this Topic.
	 */
	get_time_since_last_update(): Temporal.Duration;

	/**
	 * Notify this topic that it has been updated.
	 *
	 * @param data the new data.
	 * @param ts the time stamp of the new data
	 */
	notify_update(data: Data, ts: Temporal.Instant): void;
}

/**
 * This interface defines the base Write trait for a Topic. All topics with a write trait can
 *  be updated using a function from this interface.
 *
 * This interface extends {@link TopicBase}.
 */
export interface TopicTraitWrite<Data> extends TopicBase<Data> {
	/**
	 * Writes data to the Topic.
	 */
	write_data(data: Data): void;

	/**
	 * Writes data to the Topic with a specific timestamp.
	 */
	write_data_ts(data: Data, ts: Temporal.Instant): void;
}

//
// Type Implementations
//

/**
 * A topic that is only Readable
 */
export class TopicRead<Data>
	extends EventTarget
	implements TopicTraitRead<Data>
{
	declare private m_name: string;

	declare private m_data: Data;
	declare private m_lut: Temporal.Instant;
	declare private m_delta: Temporal.Duration;
	declare private m_has_data: boolean;

	private m_awaiting_promises = new Array<(data: Data) => void>();

	/**
	 * Constructs a Readable topic
	 *
	 * @param name the name of the topic
	 * @param initial_data the first data received
	 * @param initial_ts the first timestamp received
	 */
	public constructor(
		name: string,
		initial_data: Data,
		initial_ts: Temporal.Instant,
	) {
		super();
		this.m_name = name;

		this.m_data = initial_data;
		this.m_lut = initial_ts;
		this.m_delta = new Temporal.Duration(0);
		this.m_has_data = true;
	}
	/**
	 * Notify this topic that a new data now exists
	 *
	 * @param new_data the new data
	 * @param ts the timestamp of the new data
	 */
	public notify_update(new_data: Data, ts: Temporal.Instant) {
		this.m_data = new_data;
		this.m_delta = this.m_lut.until(ts);
		this.m_lut = ts;
		this.m_has_data = true;

		// dispatch all events
		this.dispatchEvent(new EventTopicUpdate(this, new_data, this.m_delta));
		// resolve all awaiting promises
		for (const p of this.m_awaiting_promises) {
			p(new_data);
		}
		this.m_awaiting_promises.length = 0;
	}

	has_data(): boolean {
		return this.m_has_data;
	}
	read_data(): Data {
		this.m_has_data = false;
		return this.m_data;
	}
	try_read_new_data(): Data | null {
		if (this.m_has_data) {
			this.m_has_data = false;
			return this.m_data;
		} else return null;
	}
	async read_new_data_async(): Promise<Data> {
		return new Promise<Data>((resolve, _) => {
			this.m_awaiting_promises.push(resolve);
		});
	}
	get_name(): string {
		return this.m_name;
	}
	get_last_update_time(): Temporal.Instant {
		return this.m_lut;
	}
	get_time_since_last_update(): Temporal.Duration {
		return this.m_delta;
	}
}

/**
 * A Topic Update Event. This event is emitted when a topic is updated.
 */
export class EventTopicUpdate<Data> extends Event {
	public static readonly TYPE: string = "RiverDash:TopicUpdateEvent";

	/**
	 * The new updated data.
	 */
	declare public m_data: Data;
	/**
	 * The topic that was updated.
	 */
	declare public m_topic: TopicRead<Data>;
	/**
	 * The amount of time since last update.
	 */
	declare public m_delta: Temporal.Duration;

	/**
	 * Creates a new TopicUpdateEvent
	 * @param topic The topic that was updated
	 * @param data The new data
	 */
	public constructor(
		topic: TopicRead<Data>,
		data: Data,
		delta: Temporal.Duration,
	) {
		super(EventTopicUpdate.TYPE);

		this.m_data = data;
		this.m_topic = topic;
		this.m_delta = delta;
	}

	/**
	 * Adds a listener of this type to an event
	 *
	 * @param target the EventTarget
	 * @param event_callback the event callback
	 * @returns Function to call to cancel this event
	 */
	public static add_listener_to<Data extends Any>(
		target: EventTarget,
		event_callback: (event: EventTopicUpdate<Data>) => void | Promise<void>,
	): () => void {
		target.addEventListener(
			EventTopicUpdate.TYPE,
			event_callback as (e: Event) => void,
		);

		return () =>
			target.removeEventListener(
				EventTopicUpdate.TYPE,
				event_callback as (e: Event) => void,
			);
	}
}

/**
 * A topic that is only writeable
 */
export class TopicWrite<Data> implements TopicTraitWrite<Data> {
	declare private m_name: string;

	declare private m_data_setter: (data: Data, ts: Temporal.Instant) => void;

	/**
	 * Constructs a Writable Topic.
	 *
	 * @param name the name of the topic
	 * @param data_setter callback for when new data has been set
	 */
	constructor(
		name: string,
		data_setter: (data: Data, ts: Temporal.Instant) => void,
	) {
		this.m_name = name;
		this.m_data_setter = data_setter;
	}

	write_data(data: Data): void {
		this.m_data_setter(data, Temporal.Now.instant());
	}

	write_data_ts(data: Data, ts: Temporal.Instant): void {
		this.m_data_setter(data, ts);
	}

	get_name(): string {
		return this.m_name;
	}
}

/**
 * A Topic that is Readable and Writeable
 */
export class TopicRW<Data>
	extends TopicRead<Data>
	implements TopicTraitWrite<Data>
{
	declare private m_data_setter: (data: Data, ts: Temporal.Instant) => void;

	/**
	 * Constructs a Readable and Writeable Topic.
	 *
	 * @param name the name of the topic
	 * @param initial_data the first data received
	 * @param initial_ts the first timestamp received
	 * @param data_setter callback for when new data has been set
	 */
	constructor(
		name: string,
		initial_data: Data,
		initial_ts: Temporal.Instant,
		data_setter: (data: Data, ts: Temporal.Instant) => void,
	) {
		super(name, initial_data, initial_ts);

		this.m_data_setter = data_setter;
	}

	write_data(data: Data): void {
		this.write_data_ts(data, Temporal.Now.instant());
	}
	write_data_ts(data: Data, ts: Temporal.Instant): void {
		this.notify_update(data, ts);
		this.m_data_setter(data, ts);
	}
}

export type TopicAny<Data> = TopicRead<Data> | TopicWrite<Data> | TopicRW<Data>;
