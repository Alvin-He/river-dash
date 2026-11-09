/**
 * Timing arguments for the `Control::Fire` variant in nile-common.
 * Units and field names match controls.rs; these values are used ONLY by the
 * browser simulator. This module does not serialize or send hardware commands.
 *
 * Rust uses u64 for burn time and i64 for the two signed offsets. JavaScript
 * represents exact integers only through Number.MAX_SAFE_INTEGER, so the mock
 * UI intentionally accepts only that representable subset.
 */
export interface FireTiming {
	burn_time_micros: number;
	ignition_offset_micros: number;
	propellants_offset_micros: number;
}

/** Return all input errors rather than silently rounding or clamping values. */
export function validateFireTiming(timing: FireTiming): string[] {
	const errors: string[] = [];
	if (
		!Number.isSafeInteger(timing.burn_time_micros) ||
		timing.burn_time_micros <= 0
	) {
		errors.push("Burn time must be a positive whole number of microseconds");
	}
	if (!Number.isSafeInteger(timing.ignition_offset_micros)) {
		errors.push("Ignition offset must be a whole number of microseconds");
	}
	if (!Number.isSafeInteger(timing.propellants_offset_micros)) {
		errors.push("Propellant offset must be a whole number of microseconds");
	}
	return errors;
}
