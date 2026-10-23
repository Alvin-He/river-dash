import { useEffect, useState } from "react";
import { ModuleFrame } from "../../components/ModuleFrame";
import styles from "./TelemetryModule.module.css";

export interface TelemetryReading {
	name: string;
	value: string;
	age: string;
}

/** Adapter shape for the eventual NILE Stand stream client. */
export interface TelemetryStream {
	subscribe: (onReadings: (readings: TelemetryReading[]) => void) => () => void;
}

const defaultReadings: TelemetryReading[] = [
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

interface TelemetryModuleProps {
	readings?: TelemetryReading[];
	stream?: TelemetryStream;
	isAffected?: boolean;
}

export function TelemetryModule({
	readings,
	stream,
	isAffected = false,
}: TelemetryModuleProps) {
	const [streamReadings, setStreamReadings] = useState<TelemetryReading[]>(
		readings ?? defaultReadings,
	);

	useEffect(() => {
		if (!stream) {
			setStreamReadings(readings ?? defaultReadings);
			return;
		}

		return stream.subscribe(setStreamReadings);
	}, [readings, stream]);

	const activeReadings = stream ? streamReadings : readings ?? defaultReadings;
	const sortedReadings = [...activeReadings].sort((first, second) =>
		first.name.localeCompare(second.name),
	);

	return (
		<ModuleFrame
			title="Telemetry overview"
			status="live"
			statusLabel="Live"
			className={isAffected ? "affected-module" : ""}
		>
			<div className={styles.telemetry}>
				<div className={styles.summary}>
					<span>STAND / TELEMETRY</span>
					<strong>{sortedReadings.length} CHANNELS</strong>
				</div>

				<div className={styles.table} role="table" aria-label="Live telemetry values">
					<div className={`${styles.row} ${styles.tableHead}`} role="row">
						<span role="columnheader">CHANNEL</span>
						<span role="columnheader">VALUE</span>
						<span role="columnheader">AGE</span>
					</div>

					{sortedReadings.map((reading) => (
						<div className={styles.row} role="row" key={reading.name}>
							<span className={styles.channel} role="cell">
								{reading.name}
							</span>
							<span className={styles.value} role="cell">
								{reading.value}
							</span>
							<span role="cell">{reading.age}</span>
						</div>
					))}
				</div>

				<p className={styles.footer}>Incoming values are ordered by declaration name</p>
			</div>
		</ModuleFrame>
	);
}
