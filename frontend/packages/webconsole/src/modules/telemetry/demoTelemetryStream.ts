import type { TelemetryReading, TelemetryStream } from "./TelemetryModule";

export const defaultReadings: TelemetryReading[] = [
	{ name: "fuel_pressure", value: "391.2 psi", age: "8 ms" },
	{ name: "fuel_tank_mass", value: "284.1 kg", age: "11 ms" },
	{ name: "ox_pressure", value: "428.6 psi", age: "6 ms" },
	{ name: "ox_tank_mass", value: "612.8 kg", age: "14 ms" },
	{ name: "stand_load", value: "302.4 kg", age: "17 ms" },
	{
		name: "thrust_chamber_temp",
		value: "24.8 °C",
		age: "9 ms",
	},
	{
		name: "vent_line_pressure",
		value: "14.7 psi",
		age: "13 ms",
	},
];

/**
 * Temporary stream source for UI development. Replace this adapter with the
 * backend stream client; TelemetryModule only needs its subscribe method.
 */
export const demoTelemetryStream: TelemetryStream = {
	subscribe(onReadings) {
		const emit = () => {
			onReadings(
				defaultReadings.map((reading, index) => ({
					...reading,
					value:
						index === 0
							? `${(389 + Math.random() * 4).toFixed(1)} psi`
							: reading.value,
					age: `${Math.floor(4 + Math.random() * 18)} ms`,
				})),
			);
		};

		emit();
		const intervalId = window.setInterval(emit, 1_000);
		return () => window.clearInterval(intervalId);
	},
};
