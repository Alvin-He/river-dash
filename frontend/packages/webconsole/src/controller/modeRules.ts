import type { OperatingMode, ValveId, ValveStates } from "./topics";
import { VALVES } from "./valves";

/**
 * Frontend-only advisory interpretation of the NILE console specification's
 * mode preconditions and postconditions (Controls, page 5).
 *
 * It is not a stand interlock, a transition sequencer, or proof of a valve's
 * physical position. In particular, a SAFE request has no valve prerequisites
 * and does NOT imply that all valves close.
 */
export interface ModeTransitionAssessment {
	eligible: boolean;
	/** Human-readable unmet conditions for an ordinary transition. */
	reasons: string[];
}

type RequiredValveState = "OPEN" | "CLOSED";
type ValveReport = ValveStates | null;

const ALL_VALVES = VALVES.map(({ id }) => id);
const RUN_VALVES = VALVES.filter(({ group }) => group === "RUN").map(
	({ id }) => id,
);
const PRESSURE_VALVES = VALVES.filter(({ group }) => group === "PRESSURE").map(
	({ id }) => id,
);
const VENT_VALVES = VALVES.filter(({ group }) => group === "VENT").map(
	({ id }) => id,
);
const OXIDIZER_FILL_VALVE: ValveId = "OF";

/** Collect each unsatisfied requirement; unknown or absent reports never pass. */
function requireValveStates(
	reports: ValveReport,
	ids: readonly ValveId[],
	required: RequiredValveState,
	context: string,
): string[] {
	return ids.flatMap((id) => {
		const reported = reports?.[id] ?? "UNKNOWN";
		return reported === required
			? []
			: [`${context}: ${id} must be ${required} (reported ${reported})`];
	});
}

/** Rules for leaving the *reported* current mode during a normal transition. */
function exitRequirements(mode: OperatingMode, reports: ValveReport): string[] {
	switch (mode) {
		case "OX_FILL":
			return requireValveStates(reports, ALL_VALVES, "CLOSED", "OX_FILL exit");
		case "PRESSURIZATION_FIRE":
			return requireValveStates(
				reports,
				RUN_VALVES,
				"CLOSED",
				"PRESSURIZATION_FIRE exit",
			);
		case "SAFE":
		case "CHECKOUT":
			// The NILE specification does not list ordinary exit requirements here.
			return [];
	}
}

/** Rules for entering a requested mode; never automatically move a valve. */
function entryRequirements(
	mode: OperatingMode,
	reports: ValveReport,
): string[] {
	switch (mode) {
		case "OX_FILL":
			return requireValveStates(reports, ALL_VALVES, "CLOSED", "OX_FILL entry");
		case "PRESSURIZATION_FIRE":
			return [
				...requireValveStates(
					reports,
					PRESSURE_VALVES,
					"CLOSED",
					"PRESSURIZATION_FIRE entry",
				),
				...requireValveStates(
					reports,
					RUN_VALVES,
					"CLOSED",
					"PRESSURIZATION_FIRE entry",
				),
				...requireValveStates(
					reports,
					[OXIDIZER_FILL_VALVE],
					"CLOSED",
					"PRESSURIZATION_FIRE entry",
				),
				...requireValveStates(
					reports,
					VENT_VALVES,
					"OPEN",
					"PRESSURIZATION_FIRE entry",
				),
			];
		case "SAFE":
		case "CHECKOUT":
			// No entry valve conditions are specified for these modes.
			return [];
	}
}

/**
 * Assess whether to *offer* an ordinary mode request in the mock dashboard.
 * This checks exit and entry requirements against the same latest reported
 * snapshot; it does not enact intermediate steps. For example, OX_FILL exit
 * (all closed) and PRESSURIZATION_FIRE entry (vents open) cannot both pass a
 * single snapshot. A separate approved transition procedure would be needed.
 *
 * SAFE bypasses all ordinary checks, including unknown reports or mode.
 */
export function evaluateModeTransition(
	reportedMode: OperatingMode | null,
	requestedMode: OperatingMode,
	valveReports: ValveReport,
): ModeTransitionAssessment {
	if (requestedMode === "SAFE") return { eligible: true, reasons: [] };

	if (reportedMode === null) {
		return {
			eligible: false,
			reasons: [
				"Reported stand mode is unavailable; only SAFE may be requested",
			],
		};
	}

	if (reportedMode === requestedMode) {
		return { eligible: false, reasons: [`Already reporting ${requestedMode}`] };
	}

	const reasons = [
		...exitRequirements(reportedMode, valveReports),
		...entryRequirements(requestedMode, valveReports),
	];
	return { eligible: reasons.length === 0, reasons };
}
