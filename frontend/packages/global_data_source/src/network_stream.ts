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

export class NetworkTopicStream extends EventTarget {
	declare private m_msg_cb: StreamMsgCallback | undefined;

	public constructor() {
		super();
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

		return ok(null);
	}

	public set_on_msg(cb: StreamMsgCallback | undefined) {
		this.m_msg_cb = cb;
	}
}

export type StreamMsgCallback = (message: NetworkStreamMessage) => void;

export const Error = {
	NotConnected: "Not Connected",
} as const;
export type Error_t = (typeof Error)[keyof typeof Error];
