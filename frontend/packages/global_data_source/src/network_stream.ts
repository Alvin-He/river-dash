import { err, ok, type Result } from "neverthrow";
import type {
	NetworkDeDeclare,
	NetworkSerDeclare,
} from "./network_serialize.ts";
import {
	NetworkStreamMessage_s,
	SCHEMA_PROTO,
	zod_parse,
	type NetworkStreamMessage_st,
} from "./network_schema.ts";
import type { NetworkStreamMessageType_t } from "./literals.ts";

// Reexport literals
export type {
	NetworkStreamMessageType,
	NetworkStreamMessageType_t,
} from "./literals.ts";

export class NetworkStreamMessage implements NetworkSerDeclare {
	declare public name: string;
	declare public type: NetworkStreamMessageType_t;
	declare public data: unknown;

	public constructor(
		name: string,
		type: NetworkStreamMessageType_t,
		data: unknown,
	) {
		this.name = name;
		this.type = type;
		this.data = data;
	}

	public network_serialize_declare(): object {
		return {
			name: this.name,
			type: this.type,
			data: this.data,
		} satisfies NetworkStreamMessage_st;
	}

	public static network_deserialize_declare(
		data: object,
	): Result<NetworkStreamMessage, string> {
		return zod_parse(NetworkStreamMessage_s, data).map(
			(t) => new NetworkStreamMessage(t.name, t.type, t.data),
		);
	}
}
NetworkStreamMessage satisfies NetworkDeDeclare<NetworkStreamMessage>;

export interface Transport {
	send_data(data: string): Promise<Result<void, string>>;
	receive_data(): Promise<Result<string[], string>>;
}

export class TransportNothing implements Transport {
	public send_data(_data: string): Promise<Result<void, string>> {
		return new Promise((r) => {
			r(ok());
		});
	}
	public receive_data(): Promise<Result<string[], string>> {
		return new Promise((r) => {
			setTimeout(() => r(ok([])), 100);
		});
	}
}

export class TransportWebsocket implements Transport {
	public static readonly PROTOS = [SCHEMA_PROTO];

	declare private m_endpoint: URL;
	declare private m_socket: WebSocket;
	declare private m_data_queue: Blob[];
	declare private m_awaiting_receive: [
		(queue: Blob[]) => Promise<void>,
		(reason: string) => void,
	][];

	public constructor(endpoint: URL) {
		this.m_endpoint = endpoint;

		this.connect();
	}

	public connect() {
		this.m_socket = new WebSocket(this.m_endpoint, TransportWebsocket.PROTOS);
		this.m_socket.binaryType = "blob";
		this.m_awaiting_receive = [];
		this.m_data_queue = [];

		this.m_socket.onclose = (ev) => {
			if (ev.wasClean)
				console.log(
					`Connection to ${this.m_endpoint} closed with code: ${ev.code}; reason: ${ev.reason}`,
				);
			else console.log(`Connection to ${this.m_endpoint} closed unexpectedly`);

			this.try_reconnect();
		};

		this.m_socket.onerror = () => {
			console.log(`Connection to ${this.m_endpoint} closed due to an error.`);

			this.try_reconnect();
		};

		this.m_socket.onopen = () => {
			console.log(`Connection to ${this.m_endpoint} established.`);
		};

		this.m_socket.onmessage = (ev) => {
			this.m_data_queue.push(ev.data as Blob);

			void this.m_awaiting_receive.shift()?.[0](this.m_data_queue);
			this.m_data_queue = [];
		};
	}

	public send_data(data: string): Promise<Result<void, string>> {
		return new Promise((r) => {
			try {
				this.m_socket.send(data);
				r(ok());
			} catch (e) {
				r(err(`Failed to send with error: ${String(e)}`));
			}
		});
	}

	public receive_data(): Promise<Result<string[], string>> {
		return new Promise((resolve) => {
			this.m_awaiting_receive.push([
				async (queue) => {
					const parsed_data: string[] = [];
					for (const i of queue) {
						parsed_data.push(await i.text());
					}

					resolve(ok(parsed_data));
				},
				(r) => resolve(err(r)),
			]);
		});
	}

	private try_reconnect() {
		for (const i of this.m_awaiting_receive) {
			i[1]("Connection Closed");
		}
		this.m_awaiting_receive = [];
		this.m_data_queue = [];

		const wait_ms = Math.random() * 1000;
		console.log(`Reconnecting in ${wait_ms} ms`);

		setTimeout(() => this.connect(), wait_ms);
	}
}

export class NetworkTopicStream<T extends Transport> {
	declare private m_msg_cb: StreamMsgCallback | undefined;
	declare private m_transport: T;
	declare private m_receiving: AbortController;
	declare private m_receive_task: Promise<void> | undefined;

	public constructor(transport: T) {
		this.m_transport = transport;
		this.m_receiving = new AbortController();
		this.m_receive_task = undefined;
	}

	public stream_send_message(
		msg: NetworkStreamMessage,
	): Result<null, Error | string> {
		let serialized: string;
		try {
			serialized = JSON.stringify(msg.network_serialize_declare());
		} catch (error: unknown) {
			return err(`Serialize: ${String(error)}`);
		}

		console.log("Stream message", msg);
		console.log("Serialized: ", serialized);

		this.m_transport.send_data(serialized).then(
			(r) => {
				if (r)
					r.match(
						() => undefined,
						(e) => {
							console.log(`Send msg error. Reason ${e}`);
						},
					);
			},
			(e) => {
				console.log(`Failed to send msg. Reason ${e}`);
			},
		);

		return ok(null);
	}

	public set_on_msg(cb: StreamMsgCallback | undefined) {
		this.m_msg_cb = cb;
	}

	public start() {
		this.stop();
		console.log("Start Receive");

		this.m_receiving = new AbortController();
		void this.get_new_msgs();
	}

	public stop() {
		this.m_receiving.abort();
	}

	private async get_new_msgs() {
		const abort_controller = this.m_receiving;
		let msgs: string[] = [];
		while (!abort_controller.signal.aborted) {
			console.log("Receive task run");
			for (const msg of msgs) {
				let deserialized: unknown;
				try {
					deserialized = JSON.parse(msg) as unknown;
				} catch (error: unknown) {
					console.log(`Deserialize: ${String(error)}`);
					continue;
				}

				zod_parse(NetworkStreamMessage_s, deserialized)
					.andThen((data) =>
						NetworkStreamMessage.network_deserialize_declare(data),
					)
					.match(
						(msg) => {
							if (this.m_msg_cb) this.m_msg_cb(msg);
						},
						(e) =>
							console.log(
								`PARSE: Error occurred whiling parsing new message: ${e}`,
							),
					);
			}

			// this is here so that if aborted the new data is discarded
			(await this.m_transport.receive_data()).match(
				(m) => (msgs = m),
				(e) => console.log(`Error while receiving. Reason: ${e}`),
			);
		}
	}
}

export type StreamMsgCallback = (message: NetworkStreamMessage) => void;

export const Error = {
	NotConnected: "Not Connected",
} as const;
export type Error_t = (typeof Error)[keyof typeof Error];
