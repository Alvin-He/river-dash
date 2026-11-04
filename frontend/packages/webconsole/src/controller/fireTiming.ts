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
	/** Duration between the last run-valve opening and first run-valve closure. */
	burn_time_micros: number;
	/** Ignition time relative to the last run-valve opening; may be negative. */
	ignition_offset_micros: number;
	/** Oxidizer run-valve opening time minus fuel run-valve opening time. */
	propellants_offset_micros: number;
}

/** Return all input errors rather than silently rounding or clamping values. */
export function validateFireTiming(timing: FireTiming): string[] {
	const errors: string[] = [];
	if (
		!Number.isSafeInteger(timing.burn_time_micros) ||
		timing.burn_time_micros <= 0
	) {
		// Positive duration is a conservative simulator input rule; the Rust
		// deserializer accepts any u64, including zero.
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
