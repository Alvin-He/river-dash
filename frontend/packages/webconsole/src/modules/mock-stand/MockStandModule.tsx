import { ModuleFrame } from "../../components/ModuleFrame";
import {
	OPERATING_MODES,
	useStandMode,
	type OperatingMode,
	type StandSimulator,
	type UIController,
} from "../../controller";
import styles from "./MockStandModule.module.css";

interface MockStandModuleProps {
	controller: UIController;
	simulator: StandSimulator;
	isAffected?: boolean;
}

/** Development-only publisher that represents a stand-originated update. */
export function MockStandModule({ controller, simulator, isAffected = false }: MockStandModuleProps) {
	// The simulator reads the same report topic as the rest of the dashboard.
	const reportedMode = useStandMode(controller);

	return (
		<ModuleFrame title="Mock stand simulator" status="warning" statusLabel="Simulation"
			className={isAffected ? "affected-module" : ""}>
			<div className={styles.content}>
				<p>Simulate an independent stand report (no hardware connected).</p>
				<label htmlFor="mock-stand-mode">Reported operating mode</label>
				<select id="mock-stand-mode" value={reportedMode ?? ""}
					onChange={(event) => simulator.reportMode(event.target.value as OperatingMode)}>
					<option value="" disabled>Unknown</option>
					{OPERATING_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
				</select>
				<button type="button" onClick={() => simulator.reportMode("SAFE")}>Simulate stand entering SAFE</button>
				<button type="button" onClick={() => simulator.clearReportedMode()}>Simulate missing mode report</button>
			</div>
		</ModuleFrame>
	);
}
