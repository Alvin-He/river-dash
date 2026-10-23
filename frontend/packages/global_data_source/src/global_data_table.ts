import { err, ok, Result, safeTry } from "neverthrow";
import "./topic.ts";
import { TopicOpenMode, TopicRead, TopicRW, type TopicAny } from "./topic.ts";
import {
	NetworkStreamMessage,
	NetworkStreamMessageType,
	NetworkTopicStream,
} from "./network_stream.ts";
import type {
	NetworkDeDeclare,
	NetworkDeUpdate,
	NetworkSerDeclare,
	NetworkSerUpdate,
} from "./network_serialize.ts";
import {
	DataTypes,
	network_deserialize_any_declare,
	type Any,
} from "./types.ts";

/**
 * Information describing a topic.
 *
 * For topics with children, setting any field on the children also updates the parent by references.
 */
export interface TopicInfo {
	/** Name of the topic */
	name: string;
	/** Mode the topic can be operated under */
	mode: TopicOpenMode;
	/** Type of the topic */
	type: DataTypes;
	/** The declaration of the type.
	 * Only the names & layout information are valid, all the data fields are filler values.
	 * Reading filler data from a declaration is undefined behavior.
	 *
	 * This is mostly intended for compound types like Enum, Group, Record, ADT to record their structure.
	 * */
	declaration: Any;
}

/** internal topic tracking structure */
class TopicRegistered
	implements NetworkSerUpdate, NetworkDeUpdate, NetworkSerDeclare
{
	info: TopicInfo;
	last_data: Any;
	last_data_ts: Temporal.Instant | undefined;

	read_instances = new Array<WeakRef<TopicRead<Any>>>();
	write_instances = 0;

	constructor(
		name: string,
		mode: TopicOpenMode,
		type: DataTypes,
		init_or_declaration: Any,
		init_ts?: Temporal.Instant,
	) {
		this.info = {
			name,
			mode,
			type,
			declaration: init_or_declaration,
		};
		this.last_data = init_or_declaration;
		this.last_data_ts = init_ts;
	}

	/** update this topic */
	update(data: Any, ts: Temporal.Instant) {
		this.last_data = data;
		this.last_data_ts = ts;

		this.read_instances = this.read_instances.reduce(
			(accum: WeakRef<TopicRead<Any>>[], i) => {
				const t = i.deref();
				if (t != undefined) {
					t.notify_update(data, ts);
					accum.push(i);
				}

				return accum;
			},
			[],
		);
	}

	public network_serialize_update(): string {
		return JSON.stringify([
			this.last_data == undefined
				? ""
				: this.last_data.network_serialize_update(),
			this.last_data_ts == undefined
				? ""
				: String(this.last_data_ts.epochNanoseconds),
		]);
	}
	public network_deserialize_update(data: string): Result<void, string> {
		return safeTry(
			function* (this: TopicRegistered) {
				let update_obj: unknown;
				try {
					update_obj = JSON.parse(data);
				} catch (error) {
					return err(`PARSE: Invalid JSON: ${String(error)}\n`);
				}

				if (!Array.isArray(update_obj))
					return err(
						`PARSE: Topic Update not an array: ${String(update_obj)}\n`,
					);

				const data_str: unknown = update_obj[0];
				const ts_str: unknown = update_obj[1];

				if (typeof data_str !== "string")
					return err(
						`PARSE: Topic Update data is not a string: ${String(data_str)}\n`,
					);
				if (typeof ts_str !== "string")
					return err(
						`PARSE: Topic Update ts is not a string: ${String(ts_str)}\n`,
					);

				let ts: Temporal.Instant;
				try {
					ts = Temporal.Instant.fromEpochNanoseconds(BigInt(ts_str));
				} catch (error) {
					return err(`PARSE: Topic Update ts invalid: ${String(error)}\n`);
				}

				// ripple update all data
				yield* this.last_data.network_deserialize_update(data_str);

				// send topic update
				this.update(this.last_data, ts);
				return ok();
			}.bind(this),
		);
	}

	public network_serialize_declare(): string {
		return JSON.stringify([
			this.info.name,
			this.info.mode satisfies string,
			this.info.type satisfies string,
			this.info.declaration.network_serialize_declare(),
		]);
	}
	public static network_deserialize_declare(
		data: string,
	): Result<TopicRegistered, string> {
		return safeTry(function* () {
			let declear_obj: unknown;
			try {
				declear_obj = JSON.parse(data) as unknown;
			} catch (error) {
				return err(`PARSE: Invalid JSON: ${String(error)}\n`);
			}

			if (!Array.isArray(declear_obj))
				return err(
					`PARSE: Topic Declare is not an array: ${String(declear_obj)}\n`,
				);

			const name: unknown = declear_obj[0];
			const mode: unknown = declear_obj[1];
			const type: unknown = declear_obj[2];
			const dec: unknown = declear_obj[3];

			if (typeof name !== "string")
				return err(
					`PARSE: Topic Declare name is not a string: ${String(name)}\n`,
				);
			if (typeof mode !== "string")
				return err(
					`PARSE: Topic Declare mode is not a string: ${String(mode)}\n`,
				);
			if (typeof type !== "string")
				return err(
					`PARSE: Topic Declare type is not a string: ${String(type)}\n`,
				);
			if (typeof dec !== "string")
				return err(
					`PARSE: Topic Declare dec is not a string: ${String(name)}\n`,
				);

			if (!Object.values<string>(TopicOpenMode).includes(mode))
				return err(`PARSE: Topic Declare mode unknown: ${mode}\n`);

			return ok(
				new TopicRegistered(
					name,
					mode as TopicOpenMode,
					type as DataTypes,
					yield* network_deserialize_any_declare(type, dec),
				),
			);
		});
	}
}
TopicRegistered satisfies NetworkDeDeclare<TopicRegistered>;

/**
 * Global Data Table that provides communication and data flow within RiverDash.
 *
 * Typical Usage:
 *
 * 1. Subscribing / Getting / Writing Data:
 *	```js
 *	const [topic, setTopic] = useState<TopicRead<F32> | undefined>(undefined);
 *	const [state, setState] = useState(0);
 *
 *	// effect for getting an event
 *	useEffect(() => {
 *		return EventTopicInitialized.add_listener_to(GDT, (e: EventTopicInitialized) => {
 *			// check if the topic you want got initialized
 *			if (e.m_info.name !== "Topic Name") return;
 *
 *			// get topic
 *			const topic = GDT.get_topic(e.m_info.name, TopicOpenMode.Read).match(
 *				(t) => t,
 *				(e) => console.log(e),
 *			);
 *			if (topic == undefined) return;
 *
 *			// set topic
 *			setTopic(topic as TopicRead<F32>);
 *		});
 *	});
 *
 *	// effects for getting new event data
 *	useEffect(() => {
 *		// if no topic
 *		if (topic == undefined) return;
 *
 *		return EventTopicUpdate.add_listener_to<F32>(topic, (e) => {
 *			// sets state
 *			setState(e.m_data.get());
 *
 *			// or do something else with data
 *		});
 *	}, [topic]);
 *	```
 *
 * 2. Publishing / Declaring Topic
 * ```
 *	GDT.initialize_topic(
 *		"Topic Name",
 *		TopicOpenMode.ReadWrite,
 *		DataTypes.F32,
 *		F32.from(0)._unsafeUnwrap(),
 *		undefined,
 *		TopicOpenMode.Read,
 *	);
 *  // Then follow instructions for subscribing / writing data
 * ```
 *
 */
export class GlobalDataTable extends EventTarget {
	private m_topic_stream_endpoint: NetworkTopicStream;
	// Name - Topic
	private m_topic_registry = new Map<string, TopicRegistered>();
	private m_topic_infos = new Map<string, TopicInfo>();

	/**
	 * Creates a new GlobalDataTable. Typically you don't need to call this.
	 * 	Instead use the default initialized `GDT` global singleton directly.
	 *
	 * @param topic_stream the network stream that this topic uses to replicate data
	 */
	public constructor(topic_stream: NetworkTopicStream) {
		super();

		this.m_topic_stream_endpoint = topic_stream;

		topic_stream.set_on_msg((msg) => {
			if (msg.type === NetworkStreamMessageType.Declare) {
				TopicRegistered.network_deserialize_declare(msg.data).match(
					(t) => this.declear_new_topic(t),
					(e) => console.log(e),
				);
			} else {
				const topic = this.m_topic_registry.get(msg.name);
				if (topic == undefined) {
					console.warn("WARN: Unknown/Undeclared topic received!");
					return;
				}

				const is_uninitialized = topic.last_data_ts == undefined;
				topic.network_deserialize_update(msg.data).match(
					() => {
						if (is_uninitialized)
							this.dispatchEvent(new EventTopicInitialized(topic.info));
					},
					(e) => console.log(e),
				);
			}
		});
	}

	/**
	 * Gets a topic by name
	 *
	 * Open Modes:
	 * - If a topic is in Read mode only, the it can only be opened under read mode.
	 * - If a topic is in either Write or ReadWrite mode, then R, W, RW modes are available.
	 * 		A topic can only be opened in Write or ReadWrite mode once.
	 *
	 * Note:
	 * 1. `Read` and `ReadWrite` modes will fail if the topic haven't been initialize with
	 * 	data yet. Watch {@link EventTopicInitialized} for topic initialization.
	 *
	 * 2. When opening a topic under {@link TopicOpenMode.ReadWrite}. A {@link Errors.ErrTooManyOpen}
	 * 	will be returned before {@link Errors.ErrNoDataYet} can be returned if the topic is
	 * 	uninitialized and the topic have already been opened under `Write`.
	 *
	 * Errors:
	 * - {@link Errors.ErrTooManyOpen} is thrown when attempting to open a topic in
	 * 		a writable mode more than once
	 * - {@link Errors.ErrNotAllowed} when opening read only topic in W or RW
	 * - {@link Errors.ErrNoDataYet} when opening a topic in read mode but it isn't
	 * 		initialized with data yet
	 * - {@link Errors.ErrNotFound} when the topic does not exist
	 *
	 * @param name the name of the topic
	 * @param mode the mode of the topic
	 * @returns Topic if okay, Error if not
	 */
	public get_topic(
		name: string,
		mode: TopicOpenMode.Read,
	): Result<TopicRead<Any>, Errors>;
	public get_topic(
		name: string,
		mode: TopicOpenMode.ReadWriteMany,
	): Result<TopicRW<Any>, Errors>;
	public get_topic(
		name: string,
		mode: TopicOpenMode.ReadWrite,
	): Result<TopicRW<Any>, Errors>;
	public get_topic(
		name: string,
		mode: TopicOpenMode,
	): Result<TopicAny<Any>, Errors> {
		const topic = this.m_topic_registry.get(name);
		// no topic
		if (topic == undefined) {
			return err(Errors.ErrNotFound);
		}

		// read mode
		if (mode === TopicOpenMode.Read) {
			// no data available when opening as read mode
			if (topic.last_data == undefined || topic.last_data_ts == undefined) {
				return err(Errors.ErrNoDataYet);
			}

			const t = new TopicRead(name, topic.last_data, topic.last_data_ts);
			topic.read_instances.push(new WeakRef(t));
			return ok(t);
		}

		// all below is read & write modes

		// bad mode (trying to open read mode topic as write mode)
		if (topic.info.mode === TopicOpenMode.Read)
			return err(Errors.ErrNotAllowed);

		// Single Read-Write mode, only one writer can be opened
		if (topic.info.mode === TopicOpenMode.ReadWrite) {
			// attempting to open a topic for write more than once
			if (topic.write_instances >= 1) return err(Errors.ErrTooManyOpen);
			topic.write_instances += 1;
		} // else Many Read Write Mode

		// no data available yet
		// it is assumed that if you are opening as RW you must have either supplied init data
		// or you are using the immediately returned topic from initialize_topic
		if (topic.last_data == undefined || topic.last_data_ts == undefined) {
			return err(Errors.ErrNoDataYet);
		}

		const t = new TopicRW(
			name,
			topic.last_data,
			topic.last_data_ts,
			this.get_topic_data_setter(topic),
		);
		topic.read_instances.push(new WeakRef(t));
		topic.write_instances += 1;
		return ok(t);
	}

	/**
	 * Initializes a new topic
	 *
	 * @template D Optional - the data type of the topic. Undefined behavior if D is
	 * 	specified but does not match {@link type}
	 *
	 * @param name the name of the new topic
	 * @param mode the mode of the topic
	 * @param type the type of the topic
	 * @param init_data_or_declaration Initial data or declaration of type contents
	 * @param init_ts Optional - Initial timestamp.
	 * 	If provided then {@link init_data_or_declaration} is treated as an init.
	 * 	Otherwise it is a declaration.
	 * @param peer_mode Optional - Peer Access mode.
	 * 	If specified, this topic is declared across the network
	 *
	 * @returns void if mode == {@link TopicOpenMode.Read}; TopicRW<D> if mode ==
	 * 	{@link TopicOpenMode.ReadWrite} or {@link TopicOpenMode.ReadWriteMany}
	 */
	public initialize_topic(
		name: string,
		mode: TopicOpenMode.Read,
		type: DataTypes,
		init_data_or_declaration: Any,
		init_ts?: Temporal.Instant,
		peer_mode?: TopicOpenMode,
	): void;
	public initialize_topic<D extends Any>(
		name: string,
		mode: TopicOpenMode.ReadWrite | TopicOpenMode.ReadWriteMany,
		type: DataTypes,
		init_data_or_declaration: D,
		init_ts?: Temporal.Instant,
		peer_mode?: TopicOpenMode,
	): TopicRW<D>;
	public initialize_topic<D extends Any>(
		name: string,
		mode: TopicOpenMode,
		type: DataTypes,
		init_data_or_declaration: D,
		init_ts?: Temporal.Instant,
		peer_mode?: TopicOpenMode,
	): TopicRW<D> | void {
		const topic = new TopicRegistered(
			name,
			mode,
			type,
			init_data_or_declaration,
			init_ts,
		);

		this.declear_new_topic(topic);

		// is topic initialized with value
		if (init_ts != undefined) {
			this.dispatchEvent(new EventTopicInitialized(topic.info));
		}

		// when peer mode is specified
		if (peer_mode != undefined) {
			this.m_topic_stream_endpoint.stream_send_message(
				new NetworkStreamMessage(
					name,
					NetworkStreamMessageType.Declare,
					init_data_or_declaration.network_serialize_declare(),
				),
			);

			if (init_ts != undefined) {
				this.m_topic_stream_endpoint.stream_send_message(
					new NetworkStreamMessage(
						name,
						NetworkStreamMessageType.Update,
						init_data_or_declaration.network_serialize_update(),
					),
				);
			}
		}

		// return new TopicRW if mode if RW or RWM
		if (
			mode === TopicOpenMode.ReadWrite ||
			mode === TopicOpenMode.ReadWriteMany
		) {
			if (mode === TopicOpenMode.ReadWrite) topic.write_instances += 1;

			return new TopicRW<D>(
				name,
				init_data_or_declaration,
				init_ts ?? Temporal.Instant.fromEpochMilliseconds(0),
				this.get_topic_data_setter(topic),
			);
		}
	}

	/**
	 * Get all topics
	 *
	 * @returns Get a Map of topic name to TopicInfos
	 */
	public get_all_topics(): Map<string, TopicInfo> {
		return this.m_topic_infos;
	}

	// create a callback that sets a topic's data
	private get_topic_data_setter(topic: TopicRegistered) {
		return (data: Any, ts: Temporal.Instant) => {
			const is_uninitialized = topic.last_data_ts == undefined;
			topic.update(data, ts);
			if (is_uninitialized)
				this.dispatchEvent(new EventTopicInitialized(topic.info));

			this.m_topic_stream_endpoint.stream_send_message(
				new NetworkStreamMessage(
					topic.info.name,
					NetworkStreamMessageType.Update,
					topic.last_data.network_serialize_update(),
				),
			);
		};
	}

	// called when adding a new topic ot the registry
	private declear_new_topic(entry: TopicRegistered) {
		this.m_topic_infos.set(entry.info.name, entry.info);
		this.m_topic_registry.set(entry.info.name, entry);

		this.dispatchEvent(new EventTopicDeclared(entry.info));
	}
}

/**
 * Errors generated by GlobalDataTable
 */
export enum Errors {
	/** Topic does not exist */
	ErrNotFound,
	/** Trying to open a read topic as write */
	ErrNotAllowed,
	/** A readable topic don't have data yet */
	ErrNoDataYet,
	/** Too many writers open */
	ErrTooManyOpen,
}

/**
 * Event sent when a new topic is declared
 *
 * Usage:
 *
 * ```
 * EventTopicDeclared.add_listener_to(GDT, (e: EventTopicDeclared) => {
 * 		if (e.m_info.name !== "helloworld") return;
 *
 * 		console.log("New topic declared!");
 * 		// do something with the new topic
 * 		// such as initializing some DOM element
 * });
 * ```
 *
 */
export class EventTopicDeclared extends Event {
	public static readonly TYPE: string = "RiverDash:GDTEventTopicDeclared";

	/**
	 * The new topic info
	 */
	declare public m_info: TopicInfo;

	/**
	 * Create a new {@link EventTopicDeclared}
	 *
	 * @param info the new topic info
	 */
	public constructor(info: TopicInfo) {
		super(EventTopicDeclared.TYPE);
		this.m_info = info;
	}

	/**
	 * Adds a listener of this type to an event
	 *
	 * @param target the EventTarget
	 * @param event_callback the event callback
	 * @returns Function to call to cancel this event
	 */
	public static add_listener_to(
		target: EventTarget,
		event_callback: (event: EventTopicDeclared) => void | Promise<void>,
	): () => void {
		target.addEventListener(
			EventTopicDeclared.TYPE,
			event_callback as (e: Event) => void,
		);

		return () =>
			target.removeEventListener(
				EventTopicDeclared.TYPE,
				event_callback as (e: Event) => void,
			);
	}
}

/**
 * Event sent when a new topic is initialized
 *
 * Usage:
 *
 * ```
 * EventTopicInitialized.add_listener_to(GDT, (e: EventTopicInitialized) => {
 * 		if (e.m_info.name !== "helloworld") return;
 *
 * 		console.log("New topic initialized!");
 *
 * 		let topic = GDT.get_topic("helloworld", TopicOpenMode.Read);
 * 		// do something with the new topic
 *
 * });
 * ```
 *
 */
export class EventTopicInitialized extends Event {
	public static readonly TYPE: string = "RiverDash:GDTEventTopicInitialized";

	/**
	 * The initialized topic info
	 */
	declare public m_info: TopicInfo;

	/**
	 * Create a new {@link EventTopicInitialized}
	 *
	 * @param info the new topic info
	 */
	public constructor(info: TopicInfo) {
		super(EventTopicInitialized.TYPE);
		this.m_info = info;
	}

	/**
	 * Add an event listener for this type of event to an event target.
	 * @param target EventTarget
	 * @param event_callback event callback
	 *
	 * @returns Function to call to cancel this event
	 */
	public static add_listener_to(
		target: EventTarget,
		event_callback: (event: EventTopicInitialized) => void | Promise<void>,
	): () => void {
		target.addEventListener(
			EventTopicInitialized.TYPE,
			event_callback as (e: Event) => void,
		);

		return () => {
			target.removeEventListener(
				this.TYPE,
				event_callback as (e: Event) => void,
			);
		};
	}
}

/**
 * Global {@link GlobalDataTable} Instance. Use this object unless you need a custom table.
 */
export const GDT: GlobalDataTable = new GlobalDataTable(
	new NetworkTopicStream(),
);
