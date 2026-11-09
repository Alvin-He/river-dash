import { describe, expect, it, vi } from "vitest";
import { OperatorEventLog } from "./OperatorEventLog";

describe("OperatorEventLog unit tests (session-only)", () => {
	it("puts the newest event first and retains request correlation", () => {
		const log = new OperatorEventLog();
		log.record("REQUEST", "Open OF", "info", "demo-1");
		log.record("RESPONSE", "Accepted", "info", "demo-1");
		expect(log.snapshot().map(({ kind }) => kind)).toEqual(["RESPONSE", "REQUEST"]);
		expect(log.snapshot()[0]).toMatchObject({ id: 2, commandId: "demo-1" });
	});

	it("notifies listeners until unsubscribe and retains prior snapshots", () => {
		const log = new OperatorEventLog();
		const before = log.snapshot();
		const listener = vi.fn();
		const unsubscribe = log.subscribe(listener);
		log.record("SYSTEM", "Unavailable", "warning");
		expect(listener).toHaveBeenCalledTimes(1);
		expect(before).toHaveLength(0);
		unsubscribe();
		log.record("REPORT", "Telemetry available");
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("retains only the most recent 500 events", () => {
		const log = new OperatorEventLog();
		for (let n = 1; n <= 505; n++) log.record("SYSTEM", `Event ${n}`);
		expect(log.snapshot()).toHaveLength(500);
		expect(log.snapshot()[0]).toMatchObject({ id: 505, message: "Event 505" });
		expect(log.snapshot()[499]).toMatchObject({ id: 6, message: "Event 6" });
	});
});
