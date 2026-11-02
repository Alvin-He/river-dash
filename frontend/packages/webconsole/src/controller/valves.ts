/**
 * Valve handles defined by nile-common/src/comms/commands/controls.rs.
 *
 * Each id is the two-character handle carried by NILE OpenValve/CloseValve
 * commands. These are identifiers only: the browser does not encode or send
 * physical hardware commands, and valve reports may be unavailable.
 *
 * The `system` and `group` fields are descriptive metadata for upcoming
 * mode-policy work; they do not authorize commands or imply valve state.
 */
export const VALVES = [
	{
		id: "OP",
		label: "Oxidizer pressure",
		system: "OXIDIZER",
		group: "PRESSURE",
	},
	{ id: "OV", label: "Oxidizer vent", system: "OXIDIZER", group: "VENT" },
	{ id: "OR", label: "Oxidizer run", system: "OXIDIZER", group: "RUN" },
	{ id: "OF", label: "Oxidizer fill", system: "OXIDIZER", group: "FILL" },
	{ id: "FP", label: "Fuel pressure", system: "FUEL", group: "PRESSURE" },
	{ id: "FV", label: "Fuel vent", system: "FUEL", group: "VENT" },
	{ id: "FR", label: "Fuel run", system: "FUEL", group: "RUN" },
] as const;

export type ValveId = (typeof VALVES)[number]["id"];

/** Runtime check used at the UI boundary before issuing mock valve requests. */
export function isValveId(value: string): value is ValveId {
	return VALVES.some((valve) => valve.id === value);
}
