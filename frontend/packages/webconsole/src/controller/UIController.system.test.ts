import { describe, expect, it } from "vitest";
import { MockStand } from "./MockStand";
import { MockTopicStore } from "./MockTopicStore";
import { OperatorEventLog } from "./OperatorEventLog";
import { TopicUIController } from "./UIController";
import { TOPICS } from "./topics";

function setup() {
	const topics = new MockTopicStore();
	const log = new OperatorEventLog();
	const controller = new TopicUIController(topics, topics, log);
	const stand = new MockStand(topics, { autoProcess: false });
	stand.reportMode("CHECKOUT");
	return { topics, log, controller, stand };
}

describe("controller + mock simulator system tests (no hardware)", () => {
	it("carries a valve request through request, acknowledgment, and separate report", () => {
		const { controller, stand, log } = setup();
		try {
			stand.reportValve("OF", "CLOSED");
			const id = controller.requestValve("OF", "OPEN");
			expect(stand.getPendingRequests()).toEqual([
				expect.objectContaining({ id, kind: "VALVE", valve: "OF", target: "OPEN" }),
			]);
			expect(controller.getValveStates()?.OF).toBe("CLOSED");
			const response = stand.respondToPending(true);
			expect(response).toMatchObject({ id, accepted: true });
			expect(controller.getCommandHistory()[0].status).toBe("ACCEPTED");
			// An acknowledgment must never imply the reported valve moved.
			expect(controller.getValveStates()?.OF).toBe("CLOSED");
			stand.publishAcceptedValveReport();
			expect(controller.getValveStates()?.OF).toBe("OPEN");
			expect(controller.getCommandHistory()[0].status).toBe("REPORTED");
			expect(log.snapshot().filter((event) => event.commandId === id)
				.reverse().map((event) => event.kind)).toEqual(["REQUEST", "RESPONSE", "REPORT"]);
		} finally {
			stand.dispose();
		}
	});

	it("rejects a queued mode transition if preconditions change before evaluation", () => {
		const { controller, stand, topics } = setup();
		try {
			for (const valve of ["OP", "OV", "OR", "OF", "FP", "FV", "FR"] as const) {
				stand.reportValve(valve, "CLOSED");
			}
			const id = controller.requestMode("OX_FILL");
			// The mock stand must re-check its latest state, not trust the UI check.
			stand.reportValve("OV", "OPEN");
			const response = stand.respondToPending(true);
			expect(response).toMatchObject({ id, accepted: false });
			expect(response?.message).toContain("OV must be CLOSED");
			expect(stand.getAcceptedModeReports()).toEqual([]);
			expect(topics.read(TOPICS.reportedMode)).toBe("CHECKOUT");
			expect(controller.getCommandHistory()[0].status).toBe("REJECTED");
		} finally {
			stand.dispose();
		}
	});

	it("can request SAFE with missing reports without pretending it closes valves", () => {
		const { controller, stand } = setup();
		try {
			stand.reportValve("OV", "OPEN");
			stand.clearReportedMode();
			const id = controller.requestMode("SAFE");
			expect(stand.respondToPending(true)).toMatchObject({ id, accepted: true });
			expect(controller.getReportedMode()).toBeNull();
			stand.publishAcceptedModeReport();
			expect(controller.getReportedMode()).toBe("SAFE");
			expect(controller.getValveStates()?.OV).toBe("OPEN");
			expect(() => controller.requestValve("OV", "CLOSED")).toThrow(
				"Valve control unavailable",
			);
		} finally {
			stand.dispose();
		}
	});
});
