import { describe, expect, it } from "vitest";
import { MockStand } from "./MockStand";
import { MockTopicStore } from "./MockTopicStore";
import { canRequestValve } from "./UIController";
import { TOPICS, type ValveId } from "./topics";
import { isValveId, VALVES } from "./valves";

/** Confirm our frontend mock IDs stay aligned with nile-common's valve handles. */
describe("NILE valve definitions", () => {
	it("uses exactly the seven wire handles from nile-common", () => {
		expect(VALVES.map(({ id }) => id)).toEqual([
			"OP",
			"OV",
			"OR",
			"OF",
			"FP",
			"FV",
			"FR",
		]);
		expect(new Set(VALVES.map(({ id }) => id)).size).toBe(7);
	});

	it("validates identifiers without accepting retired demo IDs", () => {
		for (const { id } of VALVES) expect(isValveId(id)).toBe(true);
		expect(isValveId("OX_FILL")).toBe(false);
		expect(isValveId("PRESSURANT")).toBe(false);
	});

	it("preserves the existing provisional manual-control policy", () => {
		for (const { id } of VALVES) {
			expect(canRequestValve("CHECKOUT", id)).toBe(true);
			expect(canRequestValve("OX_FILL", id)).toBe(id === "OF" || id === "OV");
			expect(canRequestValve("SAFE", id)).toBe(false);
			expect(canRequestValve("PRESSURIZATION_FIRE", id)).toBe(["OP", "OV", "FP", "FV"].includes(id),);
			expect(canRequestValve(null, id)).toBe(false);
		}
	});

	it("keeps missing valve reports unknown rather than inventing safe positions", () => {
		const topics = new MockTopicStore();
		const stand = new MockStand(topics);
		stand.reportValve("OF", "OPEN");
		const states = topics.read(TOPICS.valveStates);
		expect(states?.OF).toBe("OPEN");
		for (const { id } of VALVES) {
			if (id !== "OF") expect(states?.[id as ValveId]).toBe("UNKNOWN");
		}
		stand.reportMode("SAFE");
		expect(topics.read(TOPICS.valveStates)).toEqual(states);
	});
});
