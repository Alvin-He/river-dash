import { describe, expect, it, vi } from "vitest";
import { MockTopicStore } from "./MockTopicStore";
import { OperatorEventLog } from "./OperatorEventLog";
import { TOPICS, type ValveStates } from "./topics";
import { TopicUIController } from "./UIController";

const closedValves: ValveStates = {
	OP: "CLOSED", OV: "CLOSED", OR: "CLOSED", OF: "CLOSED",
	FP: "CLOSED", FV: "CLOSED", FR: "CLOSED",
};

function setup() {
	const topics = new MockTopicStore();
	const events = new OperatorEventLog();
	const controller = new TopicUIController(topics, topics, events);
	return { topics, events, controller };
}

describe("TopicUIController boundary unit tests", () => {
	it("does not let a consumer mutate a reported valve snapshot (TDD regression)", () => {
		const { topics, controller } = setup();
		topics.publish(TOPICS.valveStates, { ...closedValves });
		const returned = controller.getValveStates();
		expect(returned).not.toBeNull();
		returned!.OF = "OPEN";
		expect(controller.getValveStates()?.OF).toBe("CLOSED");
		expect(topics.read(TOPICS.valveStates)?.OF).toBe("CLOSED");
	});

	it("isolates valve subscription snapshots from the underlying reports", () => {
		const { topics, controller } = setup();
		const received: Array<ValveStates | null> = [];
		const unsubscribe = controller.subscribeToValves((states) => {
			received.push(states);
			if (states) states.OV = "OPEN";
		});
		expect(received).toEqual([null]);
		topics.publish(TOPICS.valveStates, { ...closedValves });
		expect(received).toHaveLength(2);
		expect(topics.read(TOPICS.valveStates)?.OV).toBe("CLOSED");
		unsubscribe();
		topics.publish(TOPICS.valveStates, { ...closedValves, OF: "OPEN" });
		expect(received).toHaveLength(2);
	});

	it("rejects an invalid valve target without publishing or adding history", () => {
		const { topics, controller, events } = setup();
		topics.publish(TOPICS.reportedMode, "CHECKOUT");
		const publish = vi.spyOn(topics, "publish");
		expect(() => controller.requestValve("OF", "UNKNOWN" as "OPEN")).toThrow(
			"Invalid valve request",
		);
		expect(publish).not.toHaveBeenCalled();
		expect(controller.getCommandHistory()).toEqual([]);
		expect(events.snapshot().some((entry) => entry.kind === "REQUEST")).toBe(false);
	});

	it("blocks valve commands in SAFE even if valve reports show OPEN", () => {
		const { topics, controller } = setup();
		topics.publish(TOPICS.reportedMode, "SAFE");
		topics.publish(TOPICS.valveStates, { ...closedValves, OF: "OPEN" });
		expect(() => controller.requestValve("OF", "CLOSED")).toThrow(
			"Valve control unavailable",
		);
		expect(topics.read(TOPICS.valveRequest)).toBeUndefined();
	});

	it("normalizes unavailable mode reports to null and unsubscribes correctly", () => {
		const { topics, controller } = setup();
		const reports: Array<string | null> = [];
		const unsubscribe = controller.subscribeToMode((mode) => reports.push(mode));
		topics.publish(TOPICS.reportedMode, "CHECKOUT");
		topics.clear(TOPICS.reportedMode);
		expect(controller.getReportedMode()).toBeNull();
		expect(reports).toEqual([null, "CHECKOUT", null]);
		unsubscribe();
		topics.publish(TOPICS.reportedMode, "SAFE");
		expect(reports).toEqual([null, "CHECKOUT", null]);
	});

	it("keeps reports independent of a request's acceptance", () => {
		const { topics, controller } = setup();
		topics.publish(TOPICS.reportedMode, "CHECKOUT");
		topics.publish(TOPICS.valveStates, { ...closedValves });
		const id = controller.requestValve("OF", "OPEN");
		topics.publish(TOPICS.commandResponse, { id, accepted: true, message: "Accepted in mock" });
		expect(controller.getCommandActivity()).toEqual([
			expect.objectContaining({ id, status: "ACCEPTED" }),
		]);
		expect(controller.getValveStates()?.OF).toBe("CLOSED");
		expect(controller.getCommandHistory()[0].status).toBe("ACCEPTED");
	});
});
