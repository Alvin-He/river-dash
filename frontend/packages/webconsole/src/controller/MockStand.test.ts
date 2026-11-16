import { afterEach, describe, expect, it, vi } from "vitest";
import { MockStand } from "./MockStand";
import { MockTopicStore } from "./MockTopicStore";
import { OperatorEventLog } from "./OperatorEventLog";
import { TopicUIController } from "./UIController";
import { TOPICS, type ValveStates } from "./topics";
import { VALVES } from "./valves";

function valves(state: "OPEN" | "CLOSED" | "UNKNOWN"): ValveStates {
	return Object.fromEntries(VALVES.map(({ id }) => [id, state])) as ValveStates;
}

function mock() {
	const topics = new MockTopicStore();
	const events = new OperatorEventLog();
	const controller = new TopicUIController(topics, topics, events);
	const stand = new MockStand(topics);
	return { topics, events, controller, stand };
}

describe("MockStand manual command processing (no real hardware)", () => {
	it("queues every request in arrival order and acknowledges each only once", () => {
		const { topics, controller, stand } = mock();
		stand.reportMode("CHECKOUT");
		controller.requestValve("OF", "OPEN");
		controller.requestValve("OV", "CLOSED");
		expect(stand.getPendingRequests().map(({ id }) => id)).toEqual([
			"demo-1",
			"demo-2",
		]);
		const first = stand.respondToPending(true);
		expect(first).toMatchObject({ id: "demo-1", accepted: true });
		expect(topics.read(TOPICS.commandResponse)?.id).toBe("demo-1");
		expect(stand.respondToPending(true)).toMatchObject({
			id: "demo-2",
			accepted: true,
		});
		expect(stand.respondToPending(true)).toBeNull();
		// Replaying a previously handled request must not create another response.
		topics.publish(TOPICS.valveRequest, {
			id: "demo-1",
			valve: "OF",
			target: "OPEN",
		});
		expect(stand.getPendingRequests()).toHaveLength(0);
		stand.dispose();
	});

	it("accepts an eligible mode request but does not change any reported state", () => {
		const { topics, controller, events, stand } = mock();
		stand.reportMode("CHECKOUT");
		stand.reportValve("OF", "UNKNOWN");
		topics.publish(TOPICS.valveStates, valves("CLOSED"));
		controller.requestMode("OX_FILL");
		const response = stand.respondToPending(true);
		expect(response).toMatchObject({ id: "demo-1", accepted: true });
		expect(topics.read(TOPICS.reportedMode)).toBe("CHECKOUT");
		expect(topics.read(TOPICS.valveStates)).toEqual(valves("CLOSED"));
		expect(stand.getAcceptedModeReports()).toEqual([
			{ id: "demo-1", mode: "OX_FILL" },
		]);
		expect(
			events
				.snapshot()
				.some(
					({ kind, message }) =>
						kind === "RESPONSE" && message.includes("no stand state changed"),
				),
		).toBe(true);
		expect(stand.publishAcceptedModeReport()).toEqual({
			id: "demo-1",
			mode: "OX_FILL",
		});
		expect(topics.read(TOPICS.reportedMode)).toBe("OX_FILL");
		expect(topics.read(TOPICS.valveStates)).toEqual(valves("CLOSED"));
		expect(stand.publishAcceptedModeReport()).toBeNull();
		stand.dispose();
	});

	it("reevaluates conditions at processing time and returns useful rejection reasons", () => {
		const { topics, controller, stand } = mock();
		stand.reportMode("CHECKOUT");
		topics.publish(TOPICS.valveStates, valves("CLOSED"));
		controller.requestMode("OX_FILL");
		stand.reportValve("FP", "OPEN");
		const response = stand.respondToPending(true);
		expect(response?.accepted).toBe(false);
		expect(response?.message).toContain("OX_FILL entry: FP must be CLOSED");
		expect(stand.getAcceptedModeReports()).toHaveLength(0);
		expect(topics.read(TOPICS.reportedMode)).toBe("CHECKOUT");
		stand.dispose();
	});

	it("handles SAFE ahead of ordinary queued requests without changing valve reports", () => {
		const { topics, controller, stand } = mock();
		stand.reportMode("CHECKOUT");
		stand.reportValve("OF", "OPEN");
		controller.requestValve("OF", "CLOSED");
		controller.requestMode("SAFE");
		expect(stand.respondToPending(true)).toMatchObject({
			id: "demo-2",
			accepted: true,
		});
		expect(stand.getAcceptedModeReports()[0]?.mode).toBe("SAFE");
		expect(topics.read(TOPICS.reportedMode)).toBe("CHECKOUT");
		stand.publishAcceptedModeReport();
		expect(topics.read(TOPICS.reportedMode)).toBe("SAFE");
		expect(topics.read(TOPICS.valveStates)?.OF).toBe("OPEN");
		// Now the older valve request fails on revalidation in SAFE.
		expect(stand.respondToPending(true)?.message).toContain(
			"unavailable in reported mode SAFE",
		);
		stand.dispose();
	});

	it("supports an explicit simulated rejection even when a request is eligible", () => {
		const { topics, controller, stand } = mock();
		stand.reportMode("CHECKOUT");
		controller.requestMode("SAFE");
		const response = stand.respondToPending(false);
		expect(response?.accepted).toBe(false);
		expect(response?.message).toContain("Simulated stand rejection");
		expect(topics.read(TOPICS.reportedMode)).toBe("CHECKOUT");
		expect(stand.getAcceptedModeReports()).toHaveLength(0);
		stand.dispose();
	});

	it("rejects valve commands if the reported mode changed while queued", () => {
		const { topics, controller, stand } = mock();
		stand.reportMode("CHECKOUT");
		controller.requestValve("OV", "OPEN");
		stand.reportMode("OX_FILL");
		expect(stand.respondToPending(true)?.accepted).toBe(true);
		controller.requestValve("OV", "OPEN");
		stand.reportMode("SAFE");
		expect(stand.respondToPending(true)).toMatchObject({
			id: "demo-2",
			accepted: false,
		});
		expect(topics.read(TOPICS.valveStates)).toBeUndefined();
		stand.dispose();
	});

	it("makes queued work and accepted reports observable with an unsubscribe", () => {
		const { topics, stand } = mock();
		const calls: number[] = [];
		const stop = stand.subscribeToQueue(() =>
			calls.push(stand.getPendingRequests().length),
		);
		topics.publish(TOPICS.requestedMode, { id: "demo-manual", mode: "SAFE" });
		stand.respondToPending(true);
		stand.publishAcceptedModeReport();
		expect(calls).toEqual([0, 1, 0, 0]);
		stop();
		topics.publish(TOPICS.requestedMode, { id: "demo-another", mode: "SAFE" });
		expect(calls).toHaveLength(4);
		stand.dispose();
	});

	it("never accepts an ordinary transition with UNKNOWN or missing valve reports", () => {
		const { topics, stand } = mock();
		stand.reportMode("CHECKOUT");
		topics.publish(TOPICS.requestedMode, { id: "external-1", mode: "OX_FILL" });
		const response = stand.respondToPending(true);
		expect(response?.accepted).toBe(false);
		expect(response?.message).toContain("UNKNOWN");
		stand.dispose();
	});
	it("reports an accepted valve command only after a separate simulator action", () => {
		const { topics, controller, stand } = mock();
		stand.reportMode("CHECKOUT");
		const activity: string[][] = [];
		const stop = controller.subscribeToCommandActivity((items) =>
			activity.push(items.map(({ id, status }) => `${id}:${status}`)),
		);
		controller.requestValve("OF", "OPEN");
		expect(topics.read(TOPICS.valveStates)).toBeUndefined();
		expect(controller.getCommandActivity()).toMatchObject([
			{ kind: "VALVE", valve: "OF", target: "OPEN", status: "SENT" },
		]);
		expect(stand.respondToPending(true)?.accepted).toBe(true);
		expect(controller.getCommandActivity()).toMatchObject([
			{ kind: "VALVE", valve: "OF", target: "OPEN", status: "ACCEPTED" },
		]);
		expect(topics.read(TOPICS.valveStates)).toBeUndefined();
		expect(stand.getAcceptedValveReports()).toEqual([
			{ id: "demo-1", valve: "OF", target: "OPEN" },
		]);
		expect(stand.publishAcceptedValveReport()).toEqual({
			id: "demo-1",
			valve: "OF",
			target: "OPEN",
		});
		expect(topics.read(TOPICS.valveStates)?.OF).toBe("OPEN");
		expect(topics.read(TOPICS.valveStates)?.OV).toBe("UNKNOWN");
		expect(controller.getCommandActivity()).toEqual([]);
		expect(stand.publishAcceptedValveReport()).toBeNull();
		expect(activity).toEqual([[], ["demo-1:SENT"], ["demo-1:ACCEPTED"], []]);
		stop();
		stand.dispose();
	});

	it("does not report a rejected valve request", () => {
		const { topics, controller, stand } = mock();
		stand.reportMode("CHECKOUT");
		controller.requestValve("OP", "CLOSED");
		expect(stand.respondToPending(false)?.accepted).toBe(false);
		expect(stand.getAcceptedValveReports()).toEqual([]);
		expect(stand.publishAcceptedValveReport()).toBeNull();
		expect(topics.read(TOPICS.valveStates)).toBeUndefined();
		expect(controller.getCommandActivity()).toEqual([]);
		stand.dispose();
	});

	it("does not confuse mode acknowledgment with a reported mode", () => {
		const { controller, stand } = mock();
		stand.reportMode("CHECKOUT");
		controller.requestMode("SAFE");
		expect(stand.respondToPending(true)?.accepted).toBe(true);
		expect(controller.getReportedMode()).toBe("CHECKOUT");
		expect(controller.getCommandActivity()).toMatchObject([
			{ kind: "MODE", target: "SAFE", status: "ACCEPTED" },
		]);
		stand.publishAcceptedModeReport();
		expect(controller.getReportedMode()).toBe("SAFE");
		expect(controller.getCommandActivity()).toEqual([]);
		stand.dispose();
	});
});

describe("MockStand automatic browser demo (no real stand)", () => {
	afterEach(() => vi.useRealTimers());

	function autoMock() {
		vi.useFakeTimers();
		const topics = new MockTopicStore();
		const events = new OperatorEventLog();
		const controller = new TopicUIController(topics, topics, events);
		const stand = new MockStand(topics, { autoProcess: true });
		stand.reportMode("SAFE");
		return { topics, events, controller, stand };
	}

	it("advances CHECKOUT only after separate response and mock report", () => {
		const { topics, events, controller, stand } = autoMock();
		controller.requestMode("CHECKOUT");
		expect(controller.getReportedMode()).toBe("SAFE");
		vi.advanceTimersByTime(120);
		expect(controller.getCommandActivity()).toMatchObject([
			{ kind: "MODE", target: "CHECKOUT", status: "ACCEPTED" },
		]);
		expect(topics.read(TOPICS.reportedMode)).toBe("SAFE");
		vi.advanceTimersByTime(120);
		expect(controller.getReportedMode()).toBe("CHECKOUT");
		expect(controller.getCommandActivity()).toEqual([]);
		expect(
			events
				.snapshot()
				.some(
					({ kind, message }) =>
						kind === "REPORT" && message.includes("CHECKOUT"),
				),
		).toBe(true);
		stand.dispose();
	});

	it("updates the specific reported valve on a later mock tick", () => {
		const { controller, stand } = autoMock();
		controller.requestMode("CHECKOUT");
		vi.advanceTimersByTime(240);
		controller.requestValve("OF", "OPEN");
		expect(controller.getValveStates()).toBeNull();
		vi.advanceTimersByTime(120);
		expect(controller.getValveStates()).toBeNull();
		expect(controller.getCommandActivity()).toMatchObject([
			{ kind: "VALVE", valve: "OF", status: "ACCEPTED" },
		]);
		vi.advanceTimersByTime(120);
		expect(controller.getValveStates()?.OF).toBe("OPEN");
		expect(controller.getValveStates()?.OP).toBe("UNKNOWN");
		expect(controller.getCommandActivity()).toEqual([]);
		controller.requestValve("OF", "CLOSED");
		vi.advanceTimersByTime(240);
		expect(controller.getValveStates()?.OF).toBe("CLOSED");
		stand.dispose();
	});

	it("manual mode holds all reports until the tester publishes them", () => {
		const { controller, stand } = autoMock();
		controller.requestMode("CHECKOUT");
		stand.setAutoProcessing(false);
		vi.advanceTimersByTime(1000);
		expect(controller.getReportedMode()).toBe("SAFE");
		expect(stand.getPendingRequests()).toHaveLength(1);
		expect(stand.respondToPending(true)?.accepted).toBe(true);
		expect(controller.getReportedMode()).toBe("SAFE");
		stand.setAutoProcessing(true);
		vi.advanceTimersByTime(120);
		expect(controller.getReportedMode()).toBe("CHECKOUT");
		stand.dispose();
	});

	it("does not invent safe valve positions or permit unknown preconditions", () => {
		const { controller, stand } = autoMock();
		controller.requestMode("CHECKOUT");
		vi.advanceTimersByTime(240);
		expect(() => controller.requestMode("OX_FILL")).toThrow("UNKNOWN");
		controller.requestMode("SAFE");
		vi.advanceTimersByTime(240);
		expect(controller.getReportedMode()).toBe("SAFE");
		expect(controller.getValveStates()).toBeNull();
		stand.dispose();
	});

	it("SAFE supersedes a not-yet-reported mock valve command", () => {
		const { controller, stand } = autoMock();
		controller.requestMode("CHECKOUT");
		vi.advanceTimersByTime(240);
		controller.requestValve("OF", "OPEN");
		vi.advanceTimersByTime(120); // Accepted, but not reported yet.
		controller.requestMode("SAFE");
		vi.advanceTimersByTime(240);
		expect(controller.getReportedMode()).toBe("SAFE");
		expect(controller.getValveStates()).toBeNull();
		expect(controller.getCommandActivity()).toEqual([]);
		vi.advanceTimersByTime(1000);
		expect(controller.getValveStates()).toBeNull();
		stand.dispose();
	});
});
