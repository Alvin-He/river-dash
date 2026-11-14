import { err, ok, type Result } from "neverthrow";
import type {
	NetworkDeDeclare,
	NetworkSerDeclare,
} from "./network_serialize.ts";
import {
	NetworkStreamMessage_s,
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

		this.m_transport.send_data(serialized).then(
			(r) => {
				if (r)
					r.match(
						() => undefined,
						(e) => {
							console.error(`Failed to send topic message: ${e}`);
						},
					);
			},
			(e) => {
				console.error(`Failed to send topic message: ${e}`);
			},
		);

		return ok(null);
	}

	public set_on_msg(cb: StreamMsgCallback | undefined) {
		this.m_msg_cb = cb;
	}

	public start() {
		this.stop();
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
			for (const msg of msgs) {
				let deserialized: unknown;
				try {
					deserialized = JSON.parse(msg) as unknown;
				} catch (error: unknown) {
					console.error(`Invalid topic message JSON: ${String(error)}`);
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
							console.error(`Invalid topic message: ${e}`),
					);
			}

			// Each received batch is processed once. Never replay the last batch
			// after a transport error or after a previous successful read.
			msgs = [];
			(await this.m_transport.receive_data()).match(
				(m) => { msgs = m; },
				(e) => { console.error(`Failed to receive topic messages: ${e}`); },
			);
		}
	}
}

export type StreamMsgCallback = (message: NetworkStreamMessage) => void;

export const Error = {
	NotConnected: "Not Connected",
} as const;
export type Error_t = (typeof Error)[keyof typeof Error];
