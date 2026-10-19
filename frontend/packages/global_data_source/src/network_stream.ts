import { err, ok, type Result } from "neverthrow";
import type {
	NetworkDeDeclare,
	NetworkSerDeclare,
} from "./network_serialize.ts";

export enum NetworkStreamMessageType {
	Declare = "D",
	Update = "U",
}

export class NetworkStreamMessage implements NetworkSerDeclare {
	declare public name: string;
	declare public type: NetworkStreamMessageType;
	declare public data: string;

	public constructor(
		name: string,
		type: NetworkStreamMessageType,
		data: string,
	) {
		this.name = name;
		this.type = type;
		this.data = data;
	}

	public network_serialize_declare(): string {
		return JSON.stringify([this.name, this.type as string, this.data]);
	}

	public static network_deserialize_declare(
		data: string,
	): Result<NetworkStreamMessage, string> {
		let data_obj: unknown;
		try {
			data_obj = JSON.parse(data);
		} catch (error) {
			return err(`PARSE: Invalid JSON: ${String(error)}\n`);
		}

		if (!Array.isArray(data_obj))
			return err(`PARSE: Msg body is not an array: ${String(data_obj)}\n`);

		const name: unknown = data_obj[0];
		const type: unknown = data_obj[1];
		const value: unknown = data_obj[2];

		if (typeof name !== "string")
			return err(`PARSE: Msg Name is not a string: ${String(name)}\n`);
		if (typeof type !== "string")
			return err(`PARSE: Msg type is not a string: ${String(type)}\n`);
		if (typeof value !== "string")
			return err(`PARSE: Msg data is not a string: ${String(value)}\n`);

		if (!Object.values<string>(NetworkStreamMessageType).includes(type))
			return err(`PARSE: Msg type is unknown: ${type}\n`);

		return ok(
			new NetworkStreamMessage(name, type as NetworkStreamMessageType, value),
		);
	}
}
NetworkStreamMessage satisfies NetworkDeDeclare<NetworkStreamMessage>;

export class NetworkTopicStream extends EventTarget {
	declare private m_msg_cb: StreamMsgCallback | undefined;

	public constructor() {
		super();
	}

	public stream_send_message(msg: NetworkStreamMessage): Result<null, Error> {
		console.log("Stream message", msg);
		console.log("Serialized: ", msg.network_serialize_declare());

		return ok(null);
	}

	public set_on_msg(cb: StreamMsgCallback | undefined) {
		this.m_msg_cb = cb;
	}
}

export type StreamMsgCallback = (message: NetworkStreamMessage) => void;

export enum Error {
	NotConnected,
}
