import { useEffect, useState } from "react";
import { ModuleFrame } from "../../components/ModuleFrame";
import { defaultReadings } from "./demoTelemetryStream";
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
		if (!stream) return;
		return stream.subscribe(setStreamReadings);
	}, [stream]);

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
