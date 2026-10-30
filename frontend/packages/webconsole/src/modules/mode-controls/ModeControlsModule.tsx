import { useState } from "react";
import { ModuleFrame } from "../../components/ModuleFrame";
import { useStandMode, type OperatingMode, type UIController } from "../../controller";
import styles from "./ModeControlsModule.module.css";

const MODE_LABELS: Record<OperatingMode, string> = {
	SAFE: "SAFE",
	CHECKOUT: "Checkout",
	OX_FILL: "Oxidizer fill",
	PRESSURIZATION_FIRE: "Pressurization / Fire",
};

interface ModeControlsModuleProps {
	controller: UIController;
	isAffected?: boolean;
}

/** Sends operator requests; never sets the stand's actual operating mode. */
export function ModeControlsModule({ controller, isAffected = false }: ModeControlsModuleProps) {
	const reportedMode = useStandMode(controller);
	// Local feedback records the requested mode, not a verified stand response.
	const [lastRequest, setLastRequest] = useState<OperatingMode | null>(null);

	function request(mode: OperatingMode) {
		controller.requestMode(mode);
		setLastRequest(mode);
	}

	// The special SAFE path must not be gated by normal mode transition checks.
	return (
		<ModuleFrame title="Mode requests" status="idle" statusLabel="Mock only"
			className={isAffected ? "affected-module" : ""}>
			<div className={styles.container}>
				<div className={styles.section}>
					<span className={styles.label}>STAND-REPORTED MODE</span>
					<strong className={styles.value}>{reportedMode ?? "UNKNOWN / NO REPORT"}</strong>
				</div>
				<p className={styles.note}>Requests do not imply that the stand accepted or completed a mode change.</p>
				<div className={styles.buttons}>
					{(Object.keys(MODE_LABELS) as OperatingMode[]).map((mode) => (
						<button
							key={mode}
							type="button"
							className={mode === "SAFE" ? styles.safeButton : styles.modeButton}
							disabled={mode !== "SAFE" && (reportedMode === null || reportedMode === mode)}
							onClick={() => request(mode)}
						>
							Request {MODE_LABELS[mode]}
						</button>
					))}
				</div>
				<div className={styles.requestStatus} role="status">
					{lastRequest ? `Last mock request: ${MODE_LABELS[lastRequest]} (not confirmed)` : "No mode requests sent"}
				</div>
			</div>
		</ModuleFrame>
	);
}
