import { describe, expect, test, vi } from "vitest";
import { EventTopicUpdate, TopicRead, TopicRW, TopicWrite } from "../topic.ts";
import { F32 } from "../types.ts";

describe(TopicRW, () => {
	let t1 = Temporal.Now.instant();
	const t2 = t1.add({ seconds: 20 });
	let d1 = F32.from(230)._unsafeUnwrap();
	const d2 = F32.from(110)._unsafeUnwrap();
	const d3 = F32.from(67)._unsafeUnwrap();

	const t = new TopicRW("a", d1, t1, (data, ts) => {
		d1 = data;
		t1 = ts;
	});

	test("Topic Creation", () => {
		expect(t.get_last_update_time()).toBe(t1);
		expect(t.get_name()).toBe("a");
		expect(t.has_data()).toBe(true);
		expect(t.read_data()).toBe(d1);
		expect(t.has_data()).toBe(false);
		expect(t.read_data()).toBe(d1);
	});

	test("Topic Update", async () => {
		expect(t.has_data()).toBe(false);
		const p = t.read_new_data_async();
		t.write_data_ts(d2, t2);
		expect(d1).toBe(d2);
		expect(t1).toBe(t2);
		expect(t.has_data()).toBe(true);
		expect(t.get_time_since_last_update().seconds).toBe(20);

		expect(await p).toBe(d2);
		expect(t.has_data()).toBe(true);
	});

	test("Topic Notify", () => {
		const eh = vi.fn((e: Event) => {
			const u = e as EventTopicUpdate<F32>;
			expect(u.m_delta.seconds).toBe(40);
			expect(u.m_data).toBe(d3);
			expect(u.m_topic).toBe(t);
			expect(u.m_topic.has_data()).toBe(true); // had data does not change when accessing data asynchronously
		});

		t.addEventListener(EventTopicUpdate.TYPE, eh);
		t.notify_update(d3, t2.add({ seconds: 40 }));
		expect(eh).toHaveBeenCalled();
		expect(t.has_data()).toBe(true);
		expect(t.read_data()).toBe(d3);
		expect(d1).toBe(d2); // topic update cb should not have been called
		expect(t.has_data()).toBe(false);
	});
});

describe(TopicWrite, () => {
	let t1 = Temporal.Now.instant();
	const t2 = t1.add({ seconds: 20 });
	let d1 = F32.from(230)._unsafeUnwrap();
	const d2 = F32.from(110)._unsafeUnwrap();

	const t = new TopicWrite<F32>("a", (data, ts) => {
		d1 = data;
		t1 = ts;
	});

	test("Topic Creation", () => {
		expect(t.get_name()).toBe("a");
	});

	test("Topic Update", () => {
		t.write_data_ts(d2, t2);
		expect(d1).toBe(d2);
		expect(t1).toBe(t2);
	});
});

describe(TopicRead, () => {
	const t1 = Temporal.Now.instant();
	const t2 = t1.add({ seconds: 20 });
	const d1 = F32.from(230)._unsafeUnwrap();
	// const d2 = F32.from(110)._unsafeUnwrap();
	const d3 = F32.from(67)._unsafeUnwrap();

	const t = new TopicRead("a", d1, t1);

	test("Topic Creation", () => {
		expect(t.get_last_update_time()).toBe(t1);
		expect(t.get_name()).toBe("a");
		expect(t.has_data()).toBe(true);
		expect(t.read_data()).toBe(d1);
		expect(t.has_data()).toBe(false);
		expect(t.read_data()).toBe(d1);
	});

	test("Topic Notify", () => {
		const eh = vi.fn((e: Event) => {
			const u = e as EventTopicUpdate<F32>;
			expect(u.m_delta.seconds).toBe(20);
			expect(u.m_data).toBe(d3);
			expect(u.m_topic).toBe(t);
			expect(u.m_topic.has_data()).toBe(true); // had data does not change when accessing data asynchronously
		});

		EventTopicUpdate.add_listener_to(t, eh);
		t.notify_update(d3, t2);
		expect(eh).toHaveBeenCalled();
		expect(t.has_data()).toBe(true);
		expect(t.read_data()).toBe(d3);
		expect(t.has_data()).toBe(false);
	});
});
