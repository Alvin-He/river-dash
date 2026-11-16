import { describe, expect, it } from "vitest";
import { MockStand } from "./MockStand";
import { MockTopicStore } from "./MockTopicStore";
import { OperatorEventLog } from "./OperatorEventLog";
import { TopicUIController } from "./UIController";

function setup() {
	const topics = new MockTopicStore();
	const log = new OperatorEventLog();
	const controller = new TopicUIController(topics, topics, log);
	const stand = new MockStand(topics);
	stand.reportMode("CHECKOUT");
	return { topics, log, controller, stand };
}

describe("request-ID lifecycle and operator log", () => {
	it("records REQUEST, RESPONSE, REPORT in order with a shared request ID", () => {
		const { controller, stand, log } = setup();
		const id = controller.requestValve("OF", "OPEN");
		expect(controller.getCommandHistory()[0]).toMatchObject({
			id,
			status: "SENT",
		});
		stand.respondToPending(true);
		expect(controller.getCommandHistory()[0]).toMatchObject({
			id,
			status: "ACCEPTED",
		});
		// Acceptance must not change a reported state or close the lifecycle.
		expect(controller.getValveStates()).toBeNull();
		stand.publishAcceptedValveReport();
		expect(controller.getCommandHistory()[0]).toMatchObject({
			id,
			status: "REPORTED",
		});
		expect(controller.getCommandActivity()).toEqual([]);
		expect(
			log
				.snapshot()
				.filter((event) => event.commandId === id)
				.reverse()
				.map(({ kind }) => kind),
		).toEqual(["REQUEST", "RESPONSE", "REPORT"]);
		stand.dispose();
	});

	it("retains rejection even if a separate report already equals the target", () => {
		const { controller, stand } = setup();
		stand.reportValve("OF", "OPEN");
		const id = controller.requestValve("OF", "OPEN");
		stand.respondToPending(false);
		expect(controller.getCommandHistory()[0]).toMatchObject({
			id,
			status: "REJECTED",
		});
		expect(controller.getCommandActivity()).toEqual([]);
		stand.dispose();
	});

	it("one later report retires only one of two accepted matching requests", () => {
		const { controller, stand } = setup();
		const first = controller.requestValve("OF", "OPEN");
		const second = controller.requestValve("OF", "OPEN");
		stand.respondToPending(true);
		stand.respondToPending(true);
		stand.reportValve("OF", "OPEN");
		expect(
			controller.getCommandHistory().find((record) => record.id === first)
				?.status,
		).toBe("REPORTED");
		expect(
			controller.getCommandHistory().find((record) => record.id === second)
				?.status,
		).toBe("ACCEPTED");
		expect(controller.getCommandActivity()).toHaveLength(1);
		stand.reportValve("OF", "OPEN");
		expect(controller.getCommandActivity()).toEqual([]);
		stand.dispose();
	});

	it("reports uncoupled telemetry without a command ID", () => {
		const { log, stand } = setup();
		stand.reportValve("OF", "CLOSED");
		const latest = log.snapshot()[0];
		expect(latest.kind).toBe("REPORT");
		expect(latest.commandId).toBeUndefined();
		stand.dispose();
	});

	it("notifies history subscribers and supports unsubscribe", () => {
		const { controller, stand } = setup();
		const updates: string[] = [];
		const unsubscribe = controller.subscribeToCommandHistory((history) => {
			updates.push(history[0]?.status ?? "NONE");
		});
		controller.requestMode("SAFE");
		stand.respondToPending(true);
		stand.publishAcceptedModeReport();
		expect(updates).toEqual(["NONE", "SENT", "ACCEPTED", "REPORTED"]);
		unsubscribe();
		controller.requestMode("CHECKOUT");
		expect(updates).toHaveLength(4);
		stand.dispose();
	});

	it("tracks publish failures independently of stand responses", () => {
		const topics = new MockTopicStore();
		const log = new OperatorEventLog();
		const writer = {
			publish: () => {
				throw new Error("Transport unavailable");
			},
		};
		const controller = new TopicUIController(topics, writer, log);
		expect(() => controller.requestMode("SAFE")).toThrow(
			"Transport unavailable",
		);
		expect(controller.getCommandActivity()).toEqual([]);
		expect(controller.getCommandHistory()[0]).toMatchObject({
			status: "SEND_FAILED",
		});
		expect(
			log
				.snapshot()
				.some(
					({ kind, message }) =>
						kind === "SYSTEM" && message.includes("Transport unavailable"),
				),
		).toBe(true);
	});

	it("does not equate a rejected SAFE request with reported SAFE", () => {
		const { controller, stand } = setup();
		const id = controller.requestMode("SAFE");
		stand.respondToPending(false);
		stand.reportMode("SAFE");
		expect(controller.getCommandHistory()[0]).toMatchObject({
			id,
			status: "REJECTED",
		});
		stand.dispose();
	});

	it("keeps a bounded history even if commands are repeatedly rejected", () => {
		const { controller, stand } = setup();
		for (let index = 0; index < 125; index += 1) {
			controller.requestMode("SAFE");
			stand.respondToPending(false);
		}
		expect(controller.getCommandHistory()).toHaveLength(100);
		expect(controller.getCommandHistory()[0].id).toBe("demo-125");
		stand.dispose();
	});
});
