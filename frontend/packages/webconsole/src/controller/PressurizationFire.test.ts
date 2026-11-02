import { describe, expect, it, vi, afterEach } from "vitest";
import { validateFireTiming } from "./fireTiming";
import { MockStand } from "./MockStand";
import { MockTopicStore } from "./MockTopicStore";
import { OperatorEventLog } from "./OperatorEventLog";
import { canRequestValve, TopicUIController } from "./UIController";
import { TOPICS } from "./topics";
import { VALVES } from "./valves";

const TIMING = {
	burn_time_micros: 3500000,
	ignition_offset_micros: -1500000,
	propellants_offset_micros: 250000,
};

function demo(autoProcess = false) {
	const topics = new MockTopicStore();
	const events = new OperatorEventLog();
	const controller = new TopicUIController(topics, topics, events);
	const stand = new MockStand(topics, { autoProcess });
	stand.reportMode("PRESSURIZATION_FIRE"); // Explicit mock report, not transition execution.
	return { topics, events, controller, stand };
}

describe("NILE §3.4 manual valve permissions (browser simulation)", () => {
	it("permits exactly the four pressure/vent handles in Pressurization/Fire", () => {
		const allowed = VALVES.filter(({ id }) =>
			canRequestValve("PRESSURIZATION_FIRE", id),
		).map(({ id }) => id);
		expect(allowed).toEqual(["OP", "OV", "FP", "FV"]);
		for (const id of ["OR", "OF", "FR"] as const) {
			expect(canRequestValve("PRESSURIZATION_FIRE", id)).toBe(false);
		}
	});

	it("preserves the other modes' restrictions", () => {
		expect(VALVES.every(({ id }) => canRequestValve("CHECKOUT", id))).toBe(
			true,
		);
		expect(
			VALVES.filter(({ id }) => canRequestValve("OX_FILL", id)).map(
				({ id }) => id,
			),
		).toEqual(["OV", "OF"]);
		expect(VALVES.some(({ id }) => canRequestValve("SAFE", id))).toBe(false);
	});

	it("allows pressure valve reports but rejects a run valve in Pressurization/Fire", () => {
		const { topics, controller, stand } = demo();
		expect(() => controller.requestValve("OR", "OPEN")).toThrow("unavailable");
		const id = controller.requestValve("FP", "OPEN");
		expect(topics.read(TOPICS.valveStates)).toBeUndefined();
		expect(stand.respondToPending(true)?.accepted).toBe(true);
		expect(topics.read(TOPICS.valveStates)).toBeUndefined();
		expect(stand.publishAcceptedValveReport()).toEqual({
			id,
			valve: "FP",
			target: "OPEN",
		});
		expect(controller.getValveStates()?.FP).toBe("OPEN");
		expect(controller.getValveStates()?.OR).toBe("UNKNOWN");
		stand.dispose();
	});
});

describe("mock Fire timing request (no physical command)", () => {
	it("preserves signed microseconds without rounding and rejects invalid numbers", () => {
		expect(validateFireTiming(TIMING)).toEqual([]);
		expect(validateFireTiming({ ...TIMING, burn_time_micros: 0 })).not.toEqual(
			[],
		);
		expect(
			validateFireTiming({ ...TIMING, burn_time_micros: 0.1 }),
		).not.toEqual([]);
		expect(
			validateFireTiming({ ...TIMING, ignition_offset_micros: Number.NaN }),
		).not.toEqual([]);
		expect(
			validateFireTiming({
				...TIMING,
				propellants_offset_micros: Number.MAX_SAFE_INTEGER + 1,
			}),
		).not.toEqual([]);
	});

	it("publishes a mock-only typed request and records an acknowledgment without reporting a fire", () => {
		const { controller, stand, topics, events } = demo();
		const id = controller.requestFire(TIMING);
		expect(topics.read(TOPICS.fireRequest)).toEqual({ id, ...TIMING });
		expect(controller.getCommandHistory()[0]).toMatchObject({
			id,
			kind: "FIRE",
			status: "SENT",
		});
		expect(stand.respondToPending(true)).toMatchObject({ id, accepted: true });
		expect(controller.getCommandHistory()[0]).toMatchObject({
			id,
			kind: "FIRE",
			status: "ACCEPTED",
		});
		expect(controller.getCommandActivity()).toEqual([]);
		expect(controller.getReportedMode()).toBe("PRESSURIZATION_FIRE");
		expect(controller.getValveStates()).toBeNull();
		expect(stand.getAcceptedModeReports()).toEqual([]);
		expect(stand.getAcceptedValveReports()).toEqual([]);
		expect(
			events
				.snapshot()
				.filter(({ commandId }) => commandId === id)
				.map(({ kind }) => kind)
				.reverse(),
		).toEqual(["REQUEST", "RESPONSE"]);
		stand.dispose();
	});

	it("blocks a Fire request outside the reported mode", () => {
		const { controller, stand, topics } = demo();
		stand.reportMode("CHECKOUT");
		expect(() => controller.requestFire(TIMING)).toThrow("PRESSURIZATION_FIRE");
		expect(topics.read(TOPICS.fireRequest)).toBeUndefined();
		stand.dispose();
	});

	it("revalidates reported mode when a queued Fire request is evaluated", () => {
		const { controller, stand } = demo();
		const id = controller.requestFire(TIMING);
		stand.reportMode("SAFE");
		expect(stand.respondToPending(true)).toMatchObject({ id, accepted: false });
		expect(controller.getCommandHistory()[0]).toMatchObject({
			id,
			status: "REJECTED",
		});
		expect(controller.getValveStates()).toBeNull();
		stand.dispose();
	});

	it("does not issue any stand state updates during automatic Fire acknowledgment", () => {
		vi.useFakeTimers();
		const { controller, stand } = demo(true);
		const id = controller.requestFire(TIMING);
		vi.advanceTimersByTime(300);
		expect(controller.getCommandHistory()[0]).toMatchObject({
			id,
			kind: "FIRE",
			status: "ACCEPTED",
		});
		expect(controller.getCommandActivity()).toEqual([]);
		expect(controller.getReportedMode()).toBe("PRESSURIZATION_FIRE");
		expect(controller.getValveStates()).toBeNull();
		stand.dispose();
	});
});

afterEach(() => vi.useRealTimers());
