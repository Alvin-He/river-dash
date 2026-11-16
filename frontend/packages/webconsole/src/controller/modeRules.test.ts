import { describe, expect, it } from "vitest";
import { MockTopicStore } from "./MockTopicStore";
import { OperatorEventLog } from "./OperatorEventLog";
import { TopicUIController } from "./UIController";
import { evaluateModeTransition } from "./modeRules";
import { TOPICS, type OperatingMode, type ValveStates } from "./topics";
import { VALVES } from "./valves";

/** These are simulated *reported* states, not hardware feedback. */
function reportedValves(
	defaultState: "OPEN" | "CLOSED" | "UNKNOWN",
): ValveStates {
	return Object.fromEntries(
		VALVES.map(({ id }) => [id, defaultState]),
	) as ValveStates;
}

function assess(
	from: OperatingMode | null,
	to: OperatingMode,
	reports: ValveStates | null,
) {
	return evaluateModeTransition(from, to, reports);
}

describe("NILE console mode transition requirements (simulation only)", () => {
	it("always offers SAFE, even with unknown mode and no valve reports", () => {
		for (const from of [
			null,
			"SAFE",
			"CHECKOUT",
			"OX_FILL",
			"PRESSURIZATION_FIRE",
		] as const) {
			expect(assess(from, "SAFE", null)).toEqual({
				eligible: true,
				reasons: [],
			});
		}
		expect(assess("OX_FILL", "SAFE", reportedValves("OPEN")).eligible).toBe(
			true,
		);
	});

	it("requires a known reported mode for ordinary requests", () => {
		const result = assess(null, "CHECKOUT", reportedValves("CLOSED"));
		expect(result.eligible).toBe(false);
		expect(result.reasons[0]).toContain("unavailable");
	});

	it("does not offer ordinary requests for the currently reported mode", () => {
		expect(assess("CHECKOUT", "CHECKOUT", null).eligible).toBe(false);
	});

	it("checks all seven closed valves for OX_FILL entry", () => {
		expect(
			assess("CHECKOUT", "OX_FILL", reportedValves("CLOSED")).eligible,
		).toBe(true);
		const incorrect = { ...reportedValves("CLOSED"), FV: "OPEN" as const };
		const result = assess("CHECKOUT", "OX_FILL", incorrect);
		expect(result.eligible).toBe(false);
		expect(result.reasons).toContain(
			"OX_FILL entry: FV must be CLOSED (reported OPEN)",
		);
	});

	it("checks all seven closed valves for OX_FILL exit", () => {
		expect(
			assess("OX_FILL", "CHECKOUT", reportedValves("CLOSED")).eligible,
		).toBe(true);
		const incorrect = { ...reportedValves("CLOSED"), OF: "OPEN" as const };
		expect(assess("OX_FILL", "CHECKOUT", incorrect).reasons).toContain(
			"OX_FILL exit: OF must be CLOSED (reported OPEN)",
		);
	});

	it("checks pressure, run and ox fill closed; both vents open for PRESSURIZATION_FIRE entry", () => {
		const ready = {
			...reportedValves("CLOSED"),
			OV: "OPEN" as const,
			FV: "OPEN" as const,
		};
		expect(assess("CHECKOUT", "PRESSURIZATION_FIRE", ready).eligible).toBe(
			true,
		);

		for (const id of ["OP", "FP", "OR", "FR", "OF"] as const) {
			const report = { ...ready, [id]: "OPEN" as const };
			expect(assess("CHECKOUT", "PRESSURIZATION_FIRE", report).eligible).toBe(
				false,
			);
		}
		for (const id of ["OV", "FV"] as const) {
			const report = { ...ready, [id]: "CLOSED" as const };
			expect(assess("CHECKOUT", "PRESSURIZATION_FIRE", report).eligible).toBe(
				false,
			);
		}
	});

	it("checks run valves closed for PRESSURIZATION_FIRE exit", () => {
		const report = {
			...reportedValves("OPEN"),
			OR: "CLOSED" as const,
			FR: "CLOSED" as const,
		};
		expect(assess("PRESSURIZATION_FIRE", "CHECKOUT", report).eligible).toBe(
			true,
		);
		expect(
			assess("PRESSURIZATION_FIRE", "CHECKOUT", {
				...report,
				FR: "OPEN",
			}).eligible,
		).toBe(false);
	});

	it("never treats absent or UNKNOWN reports as satisfied requirements", () => {
		expect(assess("CHECKOUT", "OX_FILL", null).eligible).toBe(false);
		expect(
			assess("CHECKOUT", "OX_FILL", reportedValves("UNKNOWN")).eligible,
		).toBe(false);
		expect(assess("PRESSURIZATION_FIRE", "CHECKOUT", null).eligible).toBe(
			false,
		);
	});

	it("does not invent a transition sequence for incompatible OX_FILL exit / FIRE entry states", () => {
		const allClosed = reportedValves("CLOSED");
		expect(assess("OX_FILL", "PRESSURIZATION_FIRE", allClosed).eligible).toBe(
			false,
		);
		const ventsOpen = {
			...allClosed,
			OV: "OPEN" as const,
			FV: "OPEN" as const,
		};
		expect(assess("OX_FILL", "PRESSURIZATION_FIRE", ventsOpen).eligible).toBe(
			false,
		);
	});
});

describe("TopicUIController mock mode requests", () => {
	it("does not publish an ineligible transition", () => {
		const topics = new MockTopicStore();
		const events = new OperatorEventLog();
		const controller = new TopicUIController(topics, topics, events);
		topics.publish(TOPICS.reportedMode, "CHECKOUT");
		expect(() => controller.requestMode("OX_FILL")).toThrow("OX_FILL entry");
		expect(topics.read(TOPICS.requestedMode)).toBeUndefined();
		expect(
			events
				.snapshot()
				.some((entry) => entry.message.startsWith("Mode request not sent")),
		).toBe(true);
	});

	it("publishes eligible mock requests without changing reported state", () => {
		const topics = new MockTopicStore();
		const controller = new TopicUIController(
			topics,
			topics,
			new OperatorEventLog(),
		);
		topics.publish(TOPICS.reportedMode, "CHECKOUT");
		topics.publish(TOPICS.valveStates, reportedValves("CLOSED"));
		controller.requestMode("OX_FILL");
		expect(topics.read(TOPICS.requestedMode)?.mode).toBe("OX_FILL");
		expect(topics.read(TOPICS.reportedMode)).toBe("CHECKOUT");
	});

	it("keeps SAFE requestable despite missing reports", () => {
		const topics = new MockTopicStore();
		const controller = new TopicUIController(
			topics,
			topics,
			new OperatorEventLog(),
		);
		controller.requestMode("SAFE");
		expect(topics.read(TOPICS.requestedMode)?.mode).toBe("SAFE");
		expect(topics.read(TOPICS.reportedMode)).toBeUndefined();
	});
});
