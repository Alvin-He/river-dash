import { describe, expect, test, vi } from "vitest";
import {
	Errors,
	EventTopicDeclared,
	EventTopicInitialized,
	GlobalDataTable,
} from "../global_data_table.ts";
import { NetworkTopicStream } from "../network_stream.ts";
import { TopicOpenMode, TopicRW } from "../topic.ts";
import { DataTypes, I32, U32 } from "../types.ts";
import { err } from "neverthrow";

describe(GlobalDataTable, () => {
	const gdt = new GlobalDataTable(new NetworkTopicStream());

	const d1 = I32.from(10)._unsafeUnwrap();
	const d2 = I32.from(20)._unsafeUnwrap();
	const d3 = U32.from(30)._unsafeUnwrap();

	const t1 = Temporal.Now.instant();
	const t2 = t1.add({ seconds: 30 });
	// const t3 = t2.add({ seconds: 30 });

	let b_init: TopicRW<I32>;
	let c_init: TopicRW<U32>;

	test("Initializing Topic", () => {
		const cb = vi.fn((e: EventTopicDeclared) => {
			expect(e.m_info.name).toBe("a");
			expect(e.m_info.mode).toBe(TopicOpenMode.Read);
			expect(e.m_info.type).toBe(DataTypes.I32);
			expect(e.m_info.declaration).toBe(d1);
		});
		EventTopicDeclared.add_listener_to(gdt, cb);

		gdt.initialize_topic("a", TopicOpenMode.Read, DataTypes.I32, d1);
		expect(cb).toHaveBeenCalledOnce();

		expect(gdt.get_all_topics().keys().toArray()).toEqual(["a"]);
		expect(gdt.get_all_topics().values().toArray()).toEqual([
			{
				name: "a",
				mode: TopicOpenMode.Read,
				type: DataTypes.I32,
				declaration: d1,
			},
		]);
		gdt.removeEventListener(
			EventTopicDeclared.TYPE,
			cb as unknown as (e: Event) => void,
		);

		b_init = gdt.initialize_topic(
			"b",
			TopicOpenMode.ReadWriteMany,
			DataTypes.I32,
			d2,
			undefined,
			TopicOpenMode.Read,
		);
		expect(b_init).toBeDefined();
		c_init = gdt.initialize_topic(
			"c",
			TopicOpenMode.ReadWrite,
			DataTypes.U32,
			d3,
			t1,
			TopicOpenMode.ReadWrite,
		);
		expect(c_init).toBeDefined();

		expect(
			gdt
				.get_all_topics()
				.entries()
				.map((x) => {
					expect(x[0]).toEqual(x[1].name);
					return x[1].name;
				})
				.toArray(),
		).toEqual(["a", "b", "c"]);
	});

	test("Getting, Setting & Updating Topic", () => {
		// failure to open modes
		expect(gdt.get_topic("a", TopicOpenMode.Read)).toEqual(
			err(Errors.ErrNoDataYet),
		);
		expect(gdt.get_topic("a", TopicOpenMode.ReadWriteMany)).toEqual(
			err(Errors.ErrNotAllowed),
		);
		expect(gdt.get_topic("a", TopicOpenMode.ReadWrite)).toEqual(
			err(Errors.ErrNotAllowed),
		);

		// b initialize cb
		const cb = vi.fn((e: EventTopicInitialized) => {
			expect(e.m_info.name).toBe("b");
			expect(e.m_info.mode).toEqual(TopicOpenMode.ReadWriteMany);
			expect(e.m_info.type).toEqual(DataTypes.I32);
			expect(e.m_info.declaration).toBe(d2);
		});
		EventTopicInitialized.add_listener_to(gdt, cb);

		// able to open b cuz no data
		expect(gdt.get_topic("b", TopicOpenMode.Read)).toEqual(
			err(Errors.ErrNoDataYet),
		);
		expect(gdt.get_topic("b", TopicOpenMode.ReadWrite)).toEqual(
			err(Errors.ErrNoDataYet),
		);
		expect(gdt.get_topic("b", TopicOpenMode.ReadWriteMany)).toEqual(
			err(Errors.ErrNoDataYet),
		);
		b_init.write_data_ts(d2, t1);
		expect(gdt.get_topic("b", TopicOpenMode.Read).isOk()).toBeTruthy();
		expect(gdt.get_topic("b", TopicOpenMode.ReadWrite).isOk()).toBeTruthy();
		const b_rwm = gdt
			.get_topic("b", TopicOpenMode.ReadWriteMany)
			._unsafeUnwrap();
		expect(b_rwm.get_name()).toBe("b");

		// successful data write on W instance and open & read on R
		b_rwm.write_data_ts(d2, t2);
		const b_r = gdt.get_topic("b", TopicOpenMode.Read)._unsafeUnwrap();
		expect(b_r.try_read_new_data()).toBe(d2);

		// successfully open c in R, no RW or RWM due to too many open
		const c_r = gdt.get_topic("c", TopicOpenMode.Read)._unsafeUnwrap();
		expect(gdt.get_topic("c", TopicOpenMode.ReadWrite)).toEqual(
			err(Errors.ErrTooManyOpen),
		);
		expect(gdt.get_topic("c", TopicOpenMode.ReadWriteMany)).toEqual(
			err(Errors.ErrTooManyOpen),
		);

		// able to read initial initialized data
		expect(c_r.try_read_new_data()).toBe(d3);
		expect(c_r.get_last_update_time()).toBe(t1);
		expect(c_init.try_read_new_data()).toBe(d3);
		expect(c_init.get_last_update_time()).toBe(t1);

		// able to update data from RW and read from R & RW
		c_init.write_data_ts(U32.from(d3.get() + 20)._unsafeUnwrap(), t2);
		expect(c_r.try_read_new_data()).toEqual(
			U32.from(d3.get() + 20)._unsafeUnwrap(),
		);
		expect(c_r.get_last_update_time()).toBe(t2);
		expect(c_init.try_read_new_data()).toEqual(
			U32.from(d3.get() + 20)._unsafeUnwrap(),
		);
		expect(c_init.get_last_update_time()).toBe(t2);

		// initialize cb should've only been called once for b initialization
		//  (a un-init, c pre-init)
		expect(cb).toHaveBeenCalledOnce();
		gdt.removeEventListener(
			EventTopicInitialized.TYPE,
			cb as unknown as (e: Event) => void,
		);
	});
});
