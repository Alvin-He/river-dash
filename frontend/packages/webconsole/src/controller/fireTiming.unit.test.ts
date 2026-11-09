import { describe, expect, it } from "vitest";
import { validateFireTiming } from "./fireTiming";

describe("validateFireTiming unit tests (simulation only)", () => {
	it("accepts positive whole-number burn times and signed integer offsets", () => {
		expect(validateFireTiming({
			burn_time_micros: 1000,
			ignition_offset_micros: -250,
			propellants_offset_micros: 0,
		})).toEqual([]);
	});

	it("rejects zero, negative, and fractional burn durations", () => {
		for (const burn of [0, -1, 1.5]) {
			expect(validateFireTiming({
				burn_time_micros: burn,
				ignition_offset_micros: 0,
				propellants_offset_micros: 0,
			})).toContain("Burn time must be a positive whole number of microseconds");
		}
	});

	it("rejects unsafe or non-finite integers instead of silently rounding", () => {
		const errors = validateFireTiming({
			burn_time_micros: Number.MAX_SAFE_INTEGER + 1,
			ignition_offset_micros: Infinity,
			propellants_offset_micros: Number.NaN,
		});
		expect(errors).toHaveLength(3);
		expect(errors[0]).toMatch(/Burn time/);
		expect(errors[1]).toMatch(/Ignition offset/);
		expect(errors[2]).toMatch(/Propellant offset/);
	});

	it("allows the exact upper safe-integer boundary", () => {
		expect(validateFireTiming({
			burn_time_micros: Number.MAX_SAFE_INTEGER,
			ignition_offset_micros: -Number.MAX_SAFE_INTEGER,
			propellants_offset_micros: Number.MAX_SAFE_INTEGER,
		})).toEqual([]);
	});
});
