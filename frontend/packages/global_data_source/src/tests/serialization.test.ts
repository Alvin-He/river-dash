import { describe, expect, test, vi } from "vitest";
import {
	ADT,
	DataTypes,
	Enum,
	F32,
	F64,
	Group,
	I16,
	I32,
	I64,
	Message,
	U16,
	U32,
	U64,
} from "../types.ts";
import {
	EventTopicDeclared,
	EventTopicInitialized,
	GlobalDataTable,
} from "../global_data_table.ts";
import {
	NetworkStreamMessage,
	NetworkTopicStream,
	type Transport,
} from "../network_stream.ts";
import { ok, type Result } from "neverthrow";
import { NetworkStreamMessageType, TopicOpenMode } from "../literals.ts";
import type { TopicRW } from "../topic.ts";

describe.for([
	{ name: DataTypes.I16, type: I16, min: -32768, max: 32767 },
	{ name: DataTypes.I32, type: I32, min: -2147483648, max: 2147483647 },
	{ name: DataTypes.U16, type: U16, min: 0, max: 65535 },
	{ name: DataTypes.U32, type: U32, min: 0, max: 4294967295 },
])("Normal Integer: $name", ({ type, min, max }) => {
	const i = type.from(0)._unsafeUnwrap();

	test("Serialize Declear", () => {
		expect(i.network_serialize_declare()).toEqual({});

		expect(i.checked_set(max - 10).isOk()).toBe(true);
		expect(i.network_serialize_declare()).toEqual({});
	});

	test("Deserialize Declare", () => {
		expect(type.network_deserialize_declare({}).isOk()).toBe(true);

		expect(type.network_deserialize_declare({ buddy: 100 }).isOk()).toBe(true);
	});

	test("Serialize Update", () => {
		expect(i.network_serialize_update()).toEqual({
			int: max - 10,
		});

		expect(i.checked_set(min + 10).isOk()).toBe(true);
		expect(i.network_serialize_update()).toEqual({
			int: min + 10,
		});
	});

	test("Deserialize Update", () => {
		expect(i.network_deserialize_update({}).isOk()).toBe(false);
		expect(i.network_deserialize_update([]).isOk()).toBe(false);
		expect(i.network_deserialize_update({ int: "str" }).isOk()).toBe(false);
		expect(i.network_deserialize_update({ int: max + 1 }).isOk()).toBe(false);
		expect(i.network_deserialize_update({ int: min - 1 }).isOk()).toBe(false);

		expect(i.get()).toBe(min + 10);
		expect(i.network_deserialize_update({ int: max - 10 }).isOk()).toBe(true);
		expect(i.get()).toBe(max - 10);
	});
});

describe.for([
	{
		name: DataTypes.I64,
		type: I64,
		min: -9223372036854775808n,
		max: 9223372036854775807n,
	},
	{ name: DataTypes.U64, type: U64, min: 0n, max: 18446744073709551615n },
])("Big integer: $name", ({ type, min, max }) => {
	const i = type.from(0n)._unsafeUnwrap();

	test("Serialize Declear", () => {
		expect(i.network_serialize_declare()).toEqual({});

		expect(i.checked_set(max - 10n).isOk()).toBe(true);
		expect(i.network_serialize_declare()).toEqual({});
	});

	test("Deserialize Declare", () => {
		expect(type.network_deserialize_declare({}).isOk()).toBe(true);

		expect(type.network_deserialize_declare({ buddy: 100 }).isOk()).toBe(true);
	});

	test("Serialize Update", () => {
		expect(i.network_serialize_update()).toEqual({
			big: String(max - 10n),
		});

		expect(i.checked_set(min + 10n).isOk()).toBe(true);
		expect(i.network_serialize_update()).toEqual({
			big: String(min + 10n),
		});
	});

	test("Deserialize Update", () => {
		expect(i.network_deserialize_update({}).isOk()).toBe(false);
		expect(i.network_deserialize_update([]).isOk()).toBe(false);
		expect(i.network_deserialize_update({ big: "str" }).isOk()).toBe(false);
		expect(i.network_deserialize_update({ big: 0 }).isOk()).toBe(false);
		expect(i.network_deserialize_update({ big: String(max + 1n) }).isOk()).toBe(
			false,
		);
		expect(i.network_deserialize_update({ big: String(min - 1n) }).isOk()).toBe(
			false,
		);

		expect(i.get()).toBe(min + 10n);
		expect(
			i.network_deserialize_update({ big: String(max - 10n) }).isOk(),
		).toBe(true);
		expect(i.get()).toBe(max - 10n);
	});
});

describe.for([
	{
		name: DataTypes.F32,
		type: F32,
		range: Math.fround(3.40282347e38),
		v_low: Math.fround(-3.40282347e38 + 1e30),
		v_high: Math.fround(3.40282347e38 - 1e30),
	},
	{
		name: DataTypes.F64,
		type: F64,
		range: 1.7976931348623157e308,
		v_low: -1.7976931348623157e308 + 1e300,
		v_high: 1.7976931348623157e308 - 1e300,
	},
])("Decimal numbers: $name", ({ type, v_low, v_high }) => {
	const d = type.from(0)._unsafeUnwrap();

	test("Serialize Declear", () => {
		expect(d.network_serialize_declare()).toEqual({});

		expect(d.checked_set(v_high).isOk()).toBe(true);
		expect(d.network_serialize_declare()).toEqual({});
	});

	test("Deserialize Declare", () => {
		expect(type.network_deserialize_declare({}).isOk()).toBe(true);

		expect(type.network_deserialize_declare({ buddy: 100 }).isOk()).toBe(true);
	});

	test("Serialize Update", () => {
		expect(d.network_serialize_update()).toEqual({ decimal: v_high });

		expect(d.checked_set(v_low).isOk()).toBe(true);
		expect(d.network_serialize_update()).toEqual({ decimal: v_low });
	});

	test("Deserialize Update", () => {
		expect(d.network_deserialize_update({}).isOk()).toBe(false);
		expect(d.network_deserialize_update([]).isOk()).toBe(false);
		expect(d.network_deserialize_update({ decimal: "str" }).isOk()).toBe(false);
		expect(d.network_deserialize_update({ decimal: v_low * 2 }).isOk()).toBe(
			false,
		);
		expect(d.network_deserialize_update({ decimal: v_high * 2 }).isOk()).toBe(
			false,
		);

		expect(d.get()).toBe(v_low);
		expect(d.network_deserialize_update({ decimal: v_high }).isOk()).toBe(true);
		expect(d.get()).toBe(v_high);
	});
});

describe(Message, () => {
	const m = new Message();

	test("Serialize Declear", () => {
		expect(m.network_serialize_declare()).toEqual({});

		m.set("abc");
		expect(m.network_serialize_declare()).toEqual({});
	});

	test("Deserialize Declare", () => {
		expect(Message.network_deserialize_declare({}).isOk()).toBe(true);

		expect(Message.network_deserialize_declare({ str: "hmmm" }).isOk()).toBe(
			true,
		);
	});

	test("Serialize Update", () => {
		expect(m.network_serialize_update()).toEqual({
			str: "abc",
		});

		m.set("Hello");
		expect(m.network_serialize_update()).toEqual({
			str: "Hello",
		});
	});

	test("Deserialize Update", () => {
		expect(m.network_deserialize_update({}).isOk()).toBe(false);
		expect(m.network_deserialize_update({ b: "ae" }).isOk()).toBe(false);
		expect(m.network_deserialize_update({ str: 123 }).isOk()).toBe(false);

		expect(m.get()).toBe("Hello");
		expect(m.network_deserialize_update({ str: "123" }).isOk()).toBe(true);
		expect(m.get()).toBe("123");
	});
});

describe(Group, () => {
	const g = new Group();
	g.add_value(I32.from(0)._unsafeUnwrap(), "a", I32.TYPE)
		.add_value(new Enum(), "b", Enum.TYPE)
		.add_value(new Message(), "c", Message.TYPE);

	const declare_obj = [
		{
			name: "a",
			type: I32.TYPE,
			value: I32.from(0)._unsafeUnwrap().network_serialize_declare(),
		},
		{
			name: "b",
			type: Enum.TYPE,
			value: new Enum().network_serialize_declare(),
		},
		{
			name: "c",
			type: Message.TYPE,
			value: new Message().network_serialize_declare(),
		},
	];

	test("Serialize Declear", () => {
		expect(g.network_serialize_declare()).toEqual(declare_obj);
	});

	test("Deserialize Declare", () => {
		expect(Group.network_deserialize_declare({}).isOk()).toBe(false);
		expect(Group.network_deserialize_declare({ hello: "world" }).isOk()).toBe(
			false,
		);
		expect(Group.network_deserialize_declare([{}]).isOk()).toBe(false);
		expect(Group.network_deserialize_declare([{ hello: "world" }]).isOk()).toBe(
			false,
		);
		expect(
			Group.network_deserialize_declare([
				{ name: "ae", type: "aer", value: "2" },
			]).isOk(),
		).toBe(false);

		expect(Group.network_deserialize_declare([]).isOk()).toBe(true);
		expect(Group.network_deserialize_declare(declare_obj).isOk()).toBe(true);
		expect(
			Group.network_deserialize_declare(declare_obj)._unsafeUnwrap(),
		).toEqual(g);
	});

	const fn_get_update = () => [
		g[0]?.value.network_serialize_update(),
		g[1]?.value.network_serialize_update(),
		g[2]?.value.network_serialize_update(),
	];

	test("Serialize Update", () => {
		expect(g.network_serialize_update()).toEqual(fn_get_update());

		(g[2]?.value as Message).set("Hello world");
		expect(g.network_serialize_update()).toEqual(fn_get_update());
	});

	test("Deserialize Update", () => {
		expect(g.network_deserialize_update({}).isOk()).toBe(false);
		expect(g.network_deserialize_update({ b: "ae" }).isOk()).toBe(false);
		expect(
			g
				.network_deserialize_update([fn_get_update()[0], fn_get_update()[1]])
				.isOk(),
		).toBe(false);

		expect(
			g
				.network_deserialize_update([
					fn_get_update()[0],
					fn_get_update()[1],
					{ str: 123 },
				])
				.isOk(),
		).toBe(false);

		expect(g.network_serialize_update()).toEqual(fn_get_update());
		const u = fn_get_update();
		u[0] = { int: 2 };
		u[2] = { str: "words are hard" };
		expect(g.network_deserialize_update(u).isOk()).toBe(true);
		expect((g[0]?.value as I32).get()).toBe(2);
		expect((g[2]?.value as Message).get()).toBe("words are hard");
	});
});

describe(Enum, () => {
	const e = new Enum();
	e.associate(1, "a").associate(2, "b").associate(-1, "c");

	const declare_obj = {
		variants: [
			[1, "a"],
			[2, "b"],
			[-1, "c"],
		],
	};

	test("Serialize Declear", () => {
		expect(e.network_serialize_declare()).toEqual(declare_obj);
		expect(e.set_active(1).isOk());
		expect(e.network_serialize_declare()).toEqual(declare_obj);
	});

	test("Deserialize Declare", () => {
		expect(Enum.network_deserialize_declare({}).isOk()).toBe(false);
		expect(Enum.network_deserialize_declare({ hello: "world" }).isOk()).toBe(
			false,
		);

		expect(Enum.network_deserialize_declare({ variants: [] }).isOk()).toBe(
			true,
		);
		expect(Enum.network_deserialize_declare(declare_obj).isOk()).toBe(true);
		const r = Enum.network_deserialize_declare(declare_obj)._unsafeUnwrap();
		expect(r.set_active(1).isOk());
		expect(r).toEqual(e);
	});

	test("Serialize Update", () => {
		expect(e.network_serialize_update()).toEqual({ variant: 1 });

		e.set_active(2);
		expect(e.network_serialize_update()).toEqual({ variant: 2 });
	});

	test("Deserialize Update", () => {
		expect(e.network_deserialize_update({ variant: 100 }).isOk()).toBe(false);
		expect(e.network_deserialize_update({ variant: 1.2 }).isOk()).toBe(false);
		expect(e.network_deserialize_update({ variant: "Aer" }).isOk()).toBe(false);

		expect(e.network_deserialize_update({}).isOk()).toBe(true);
		expect(e.network_deserialize_update({ b: "ae" }).isOk()).toBe(true);

		expect(e.get_active()?.discriminant).toBe(undefined);
		expect(e.network_deserialize_update({ variant: -1 }).isOk()).toBe(true);
		expect(e.get_active()?.discriminant).toBe(-1);
	});
});

describe(ADT, () => {
	const a = new ADT();
	a.associate(1, "a", I32.from(0)._unsafeUnwrap(), I32.TYPE)
		.associate(2, "b", new Enum(), Enum.TYPE)
		.associate(-1, "c", new Group(), Group.TYPE);

	const declare_obj = {
		variants: [
			[
				1,
				{
					name: "a",
					type: I32.TYPE,
					value: I32.from(0)._unsafeUnwrap().network_serialize_declare(),
				},
			],
			[
				2,
				{
					name: "b",
					type: Enum.TYPE,
					value: new Enum().network_serialize_declare(),
				},
			],
			[
				-1,
				{
					name: "c",
					type: Group.TYPE,
					value: new Group().network_serialize_declare(),
				},
			],
		],
	};

	test("Serialize Declear", () => {
		expect(a.network_serialize_declare()).toEqual(declare_obj);
		expect(a.set_active(1).isOk());
		expect(a.network_serialize_declare()).toEqual(declare_obj);
	});

	test("Deserialize Declare", () => {
		expect(ADT.network_deserialize_declare({}).isOk()).toBe(false);
		expect(ADT.network_deserialize_declare({ hello: "world" }).isOk()).toBe(
			false,
		);

		expect(ADT.network_deserialize_declare({ variants: [] }).isOk()).toBe(true);
		expect(ADT.network_deserialize_declare(declare_obj).isOk()).toBe(true);
		const r = ADT.network_deserialize_declare(declare_obj)._unsafeUnwrap();
		expect(r.set_active(1).isOk());
		expect(r).toEqual(a);
	});

	test("Serialize Update", () => {
		expect(a.network_serialize_update()).toEqual({
			variant: 1,
			value: I32.from(0)._unsafeUnwrap().network_serialize_update(),
		});

		a.set_active(2);
		expect(a.network_serialize_update()).toEqual({
			variant: 2,
			value: new Enum().network_serialize_update(),
		});
	});

	test("Deserialize Update", () => {
		expect(a.network_deserialize_update({ variant: 100 }).isOk()).toBe(false);
		expect(a.network_deserialize_update({ variant: 1.2 }).isOk()).toBe(false);
		expect(a.network_deserialize_update({ variant: "Aer" }).isOk()).toBe(false);

		expect(a.network_deserialize_update({}).isOk()).toBe(true);
		expect(a.network_deserialize_update({ b: "ae" }).isOk()).toBe(true);
		expect(a.network_deserialize_update({ variant: 1, b: "ae" }).isOk()).toBe(
			true,
		);

		expect(a.get_active()?.discriminant).toBe(1);
		expect(
			a.network_deserialize_update({ variant: -1, value: [] }).isOk(),
		).toBe(true);
		expect(a.get_active()?.discriminant).toBe(-1);
		expect(a.get_active()?.value).toEqual(new Group());
	});
});

class TransportTest implements Transport {
	public msgs_sent: string[] = [];
	public msgs_received: string[] = [];

	public send_data(data: string): Promise<Result<void, string>> {
		return new Promise((r) => {
			this.msgs_sent.push(data);
			r(ok());
		});
	}

	public receive_data(): Promise<Result<string[], string>> {
		return new Promise((r) =>
			setTimeout(() => {
				const received = this.msgs_received;
				this.msgs_received = [];
				r(ok(received));
			}, 10),
		);
	}
}

describe(NetworkStreamMessage, () => {
	test("Serialize", () => {
		expect(
			new NetworkStreamMessage(
				"a",
				NetworkStreamMessageType.Declare,
				new Message("b").network_serialize_update(),
			).network_serialize_declare(),
		).toEqual({
			name: "a",
			type: NetworkStreamMessageType.Declare,
			data: {
				str: "b",
			},
		});

		expect(
			new NetworkStreamMessage(
				"a",
				NetworkStreamMessageType.Declare,
				{},
			).network_serialize_declare(),
		).toEqual({
			name: "a",
			type: NetworkStreamMessageType.Declare,
			data: {},
		});
	});

	test("Deserialize", () => {
		expect(NetworkStreamMessage.network_deserialize_declare({}).isOk()).toBe(
			false,
		);
		expect(
			NetworkStreamMessage.network_deserialize_declare({
				name: "a",
				data: {},
			}).isOk(),
		).toBe(false);
		expect(
			NetworkStreamMessage.network_deserialize_declare({
				name: "a",
				type: "blat",
				data: {},
			}).isOk(),
		).toBe(false);

		expect(
			NetworkStreamMessage.network_deserialize_declare({
				name: "a",
				type: NetworkStreamMessageType.Update,
				data: { str: "hello" },
			}).isOk(),
		).toBe(true);

		const m = NetworkStreamMessage.network_deserialize_declare({
			name: "a",
			type: NetworkStreamMessageType.Update,
			data: { str: "hello" },
		})._unsafeUnwrap();
		expect(m.name).toBe("a");
		expect(m.type).toBe(NetworkStreamMessageType.Update);
		expect(m.data).toEqual({ str: "hello" });
	});
});

describe(GlobalDataTable, () => {
	const net = new TransportTest();
	const gdt = new GlobalDataTable(new NetworkTopicStream(net));
	const t1 = Temporal.Now.instant();
	const t2 = t1.add({ seconds: 20 });
	const t3 = t1.add({ seconds: 40 });

	let b_init: TopicRW<Message>;
	let c_init: TopicRW<Message>;

	test("Send Declaration", () => {
		gdt.initialize_topic("a", TopicOpenMode.Read, Message.TYPE, new Message());
		b_init = gdt.initialize_topic(
			"b",
			TopicOpenMode.ReadWrite,
			Message.TYPE,
			new Message(),
			undefined,
			TopicOpenMode.Read,
		);

		c_init = gdt.initialize_topic(
			"c",
			TopicOpenMode.ReadWriteMany,
			Message.TYPE,
			new Message(),
			t1,
			TopicOpenMode.ReadWriteMany,
		);

		expect(net.msgs_sent).toEqual([
			JSON.stringify({
				name: "b",
				type: NetworkStreamMessageType.Declare,
				data: {
					name: "b",
					mode: TopicOpenMode.Read,
					type: Message.TYPE,
					declaration: new Message().network_serialize_declare(),
				},
			}),
			JSON.stringify({
				name: "c",
				type: NetworkStreamMessageType.Declare,
				data: {
					name: "c",
					mode: TopicOpenMode.ReadWriteMany,
					type: Message.TYPE,
					declaration: new Message().network_serialize_declare(),
				},
			}),
			JSON.stringify({
				name: "c",
				type: NetworkStreamMessageType.Update,
				data: {
					data: new Message().network_serialize_update(),
					ts: String(t1.epochNanoseconds),
				},
			}),
		]);
		net.msgs_sent = [];
	});

	test("Receive Declaration", async () => {
		const cb = vi.fn((e: EventTopicDeclared) => {
			expect(e.m_info.name).toBe("a");
			expect(e.m_info.mode).toBe(TopicOpenMode.Read);
		});
		const rm = EventTopicDeclared.add_listener_to(gdt, cb);

		net.msgs_received = [
			JSON.stringify({
				type: NetworkStreamMessageType.Declare,
				data: {
					name: "a",
					mode: TopicOpenMode.Read,
					type: Message.TYPE,
				},
			}),
			JSON.stringify({}),
			JSON.stringify({
				name: "a",
				type: NetworkStreamMessageType.Declare,
				data: {
					name: "a",
					mode: TopicOpenMode.Read,
					type: Message.TYPE,
				},
			}),
			JSON.stringify({
				name: "a",
				type: NetworkStreamMessageType.Declare,
				data: {
					name: "a",
					mode: TopicOpenMode.Read,
					type: Message.TYPE,
				},
			}),
		];
		// yield to give receive time to run
		await new Promise((r) => setTimeout(r, 20));
		expect(cb).toHaveBeenCalledTimes(0);

		net.msgs_received = [
			JSON.stringify({
				name: "a",
				type: NetworkStreamMessageType.Declare,
				data: {
					name: "a",
					mode: TopicOpenMode.Read,
					type: Message.TYPE,
				},
			}),
			JSON.stringify({
				name: "a",
				type: NetworkStreamMessageType.Declare,
				data: {
					name: "a",
					mode: TopicOpenMode.Read,
					type: Message.TYPE,
					declaration: new Message().network_serialize_declare(),
				},
			}),
			JSON.stringify({
				name: "a",
				type: NetworkStreamMessageType.Declare,
				data: {
					name: "a",
					mode: TopicOpenMode.Read,
					type: Message.TYPE,
				},
			}),
		];
		await new Promise((r) => setTimeout(r, 20));
		expect(cb).toHaveBeenCalledOnce();
		rm();
	});

	test("Receive Update", async () => {
		const cb = vi.fn((e: EventTopicInitialized) => {
			expect(e.m_info.name).toBe("a");
			expect(e.m_info.mode).toBe(TopicOpenMode.Read);
		});
		const rm = EventTopicInitialized.add_listener_to(gdt, cb);

		net.msgs_received = [
			JSON.stringify({
				name: "a",
				type: NetworkStreamMessageType.Update,
				data: {
					data: new Message("hello").network_serialize_update(),
				},
			}),
			JSON.stringify({
				type: NetworkStreamMessageType.Update,
				data: {
					ts: t1.epochNanoseconds.toString(),
					data: new Message("hello").network_serialize_update(),
				},
			}),
			JSON.stringify({
				name: "a",
				type: NetworkStreamMessageType.Update,
				data: {},
			}),
		];
		// yield to give receive time to run
		await new Promise((r) => setTimeout(r, 20));
		expect(cb).toHaveBeenCalledTimes(0);

		net.msgs_received = [
			JSON.stringify({
				name: "a",
				type: NetworkStreamMessageType.Update,
				data: {
					ts: t1.epochNanoseconds.toString(),
					data: { str: 123 },
				},
			}),
			JSON.stringify({
				name: "a",
				type: NetworkStreamMessageType.Update,
				data: {
					ts: t1.epochNanoseconds.toString(),
					data: new Message("hello").network_serialize_update(),
				},
			}),
			JSON.stringify({
				name: "a",
				type: NetworkStreamMessageType.Update,
				data: {
					ts: t1.epochNanoseconds.toString(),
					data: { int: 3 },
				},
			}),
		];
		await new Promise((r) => setTimeout(r, 20));
		expect(cb).toHaveBeenCalledOnce();
		rm();

		expect(gdt.get_topic("a", TopicOpenMode.Read).isOk()).toBe(true);
		expect(
			(
				gdt
					.get_topic("a", TopicOpenMode.Read)
					._unsafeUnwrap()
					.try_read_new_data() as Message
			).get(),
		).toBe("hello");
	});

	test("Send updates", () => {
		b_init.write_data_ts(new Message("123"), t2);
		c_init.write_data_ts(new Message("456"), t3);

		expect(net.msgs_sent).toEqual([
			JSON.stringify({
				name: "b",
				type: NetworkStreamMessageType.Update,
				data: {
					data: new Message("123").network_serialize_update(),
					ts: String(t2.epochNanoseconds),
				},
			}),
			JSON.stringify({
				name: "c",
				type: NetworkStreamMessageType.Update,
				data: {
					data: new Message("456").network_serialize_update(),
					ts: String(t3.epochNanoseconds),
				},
			}),
		]);
		net.msgs_sent = [];
	});

	test("Batch multiple updates", async () => {
		b_init.write_data_ts(new Message("ah"), t1);
		b_init.write_data_ts(new Message("ahb"), t1);
		c_init.write_data_ts(new Message("ahh"), t2);

		net.msgs_received = [
			JSON.stringify({
				name: "a",
				type: NetworkStreamMessageType.Update,
				data: {
					ts: t2.epochNanoseconds.toString(),
					data: new Message("lol").network_serialize_update(),
				},
			}),
			JSON.stringify({
				name: "a",
				type: NetworkStreamMessageType.Update,
				data: {
					ts: t3.epochNanoseconds.toString(),
					data: new Message("buu").network_serialize_update(),
				},
			}),
			JSON.stringify({
				name: "a",
				type: NetworkStreamMessageType.Update,
				data: {
					ts: t1.epochNanoseconds.toString(),
					data: { int: 3 },
				},
			}),
			JSON.stringify({
				name: "c",
				type: NetworkStreamMessageType.Update,
				data: {
					ts: t3.epochNanoseconds.toString(),
					data: new Message("daa").network_serialize_update(),
				},
			}),
		];
		await new Promise((r) => setTimeout(r, 20));

		expect(net.msgs_sent).toEqual([
			JSON.stringify({
				name: "b",
				type: NetworkStreamMessageType.Update,
				data: {
					data: new Message("ah").network_serialize_update(),
					ts: String(t1.epochNanoseconds),
				},
			}),
			JSON.stringify({
				name: "b",
				type: NetworkStreamMessageType.Update,
				data: {
					data: new Message("ahb").network_serialize_update(),
					ts: String(t1.epochNanoseconds),
				},
			}),
			JSON.stringify({
				name: "c",
				type: NetworkStreamMessageType.Update,
				data: {
					data: new Message("ahh").network_serialize_update(),
					ts: String(t2.epochNanoseconds),
				},
			}),
		]);
		net.msgs_sent = [];

		expect(
			(
				gdt
					.get_topic("a", TopicOpenMode.Read)
					._unsafeUnwrap()
					.try_read_new_data() as Message
			).get(),
		).toBe("buu");
		expect(b_init.try_read_new_data()?.get()).toBe("ahb");
		expect(c_init.try_read_new_data()?.get()).toBe("daa");
	});
});
