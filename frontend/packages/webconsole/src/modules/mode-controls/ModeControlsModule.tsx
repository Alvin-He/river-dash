import { useEffect, useState } from "react";
import { ModuleFrame } from "../../components/ModuleFrame";
import { canRequestValve } from "../../controller/UIController";
import { evaluateModeTransition } from "../../controller/modeRules";
import {
	OPERATING_MODES,
	VALVES,
	useStandMode,
	validateFireTiming,
	type CommandActivity,
	type CommandRecord,
	type FireTiming,
	type OperatingMode,
	type UIController,
	type ValveStates,
} from "../../controller";
import styles from "./ModeControlsModule.module.css";

interface Props {
	controller: UIController;
	isAffected?: boolean;
}

type ValveTarget = "OPEN" | "CLOSED";

const MODE_LABELS: Record<OperatingMode, string> = {
	SAFE: "SAFE",
	CHECKOUT: "Checkout",
	OX_FILL: "Ox fill",
	PRESSURIZATION_FIRE: "Press / Fire",
};

/** Reported = green; pending = dashed orange; available = solid orange. */
function buttonOutline(
	reported: boolean,
	pending: boolean,
	available: boolean,
): string {
	if (pending) return styles.pending;
	if (reported) return styles.reported;
	if (available) return styles.available;
	return styles.unavailable;
}

/** Empty input stays invalid; Number("") incorrectly converts an empty field to zero. */
function parseMicros(value: string): number {
	const text = value.trim();
	return /^-?\d+$/.test(text) ? Number(text) : Number.NaN;
}

/**
 * The mode panel is a browser-only NILE mock. It never serializes or sends a
 * physical Control::Fire or valve command. Only simulated stand reports may
 * create green outlines; command acknowledgments do not confirm a position.
 */
export function ModeControlsModule({ controller, isAffected = false }: Props) {
	const mode = useStandMode(controller);
	const [valves, setValves] = useState<ValveStates | null>(() =>
		controller.getValveStates(),
	);
	const [activity, setActivity] = useState<readonly CommandActivity[]>(() =>
		controller.getCommandActivity(),
	);
	const [history, setHistory] = useState<readonly CommandRecord[]>(() =>
		controller.getCommandHistory(),
	);
	const [lastRequestId, setLastRequestId] = useState<string | null>(null);
	const [requestError, setRequestError] = useState<string | null>(null);
	const [fireInputs, setFireInputs] = useState({
		burn_time_micros: "",
		ignition_offset_micros: "",
		propellants_offset_micros: "",
	});

	useEffect(() => controller.subscribeToValves(setValves), [controller]);
	useEffect(
		() => controller.subscribeToCommandActivity(setActivity),
		[controller],
	);
	useEffect(
		() => controller.subscribeToCommandHistory(setHistory),
		[controller],
	);

	function submitRequest(send: () => string): void {
		try {
			setLastRequestId(send());
			setRequestError(null);
		} catch (error) {
			setRequestError(error instanceof Error ? error.message : String(error));
		}
	}

	/** Fire values are signed/unsigned integer microseconds as in Control::Fire. */
	const timing: FireTiming = {
		burn_time_micros: parseMicros(fireInputs.burn_time_micros),
		ignition_offset_micros: parseMicros(fireInputs.ignition_offset_micros),
		propellants_offset_micros: parseMicros(
			fireInputs.propellants_offset_micros,
		),
	};
	const timingErrors = validateFireTiming(timing);
	const hasFireInput = Object.values(fireInputs).some(
		(value) => value.trim().length > 0,
	);
	const pendingFire = activity.some((request) => request.kind === "FIRE");
	const pendingMode = activity.some((request) => request.kind === "MODE");
	const permittedValves = VALVES.filter(({ id }) => canRequestValve(mode, id));
	const lastRecord = history.find((record) => record.id === lastRequestId);

	function feedback(): string {
		if (requestError) return requestError;
		if (!lastRequestId) return "No requests yet";
		if (!lastRecord) return `${lastRequestId}: no longer in recent history`;
		const subject =
			lastRecord.kind === "MODE"
				? `Mode ${lastRecord.target}`
				: lastRecord.kind === "VALVE"
					? `Valve ${lastRecord.valve} ${lastRecord.target}`
					: "Simulated Fire";
		switch (lastRecord.status) {
			case "SENT":
				return `${subject}: request sent (${lastRecord.id})`;
			case "ACCEPTED":
				return `${subject}: mock acknowledged (${lastRecord.id})`;
			case "REPORTED":
				return `${subject}: matching simulated report (${lastRecord.id})`;
			case "REJECTED":
				return `${subject}: rejected — ${lastRecord.detail}`;
			case "SEND_FAILED":
				return `${subject}: could not publish — ${lastRecord.detail}`;
		}
	}

	return (
		<ModuleFrame
			title="Mode & valve control"
			status="warning"
			statusLabel="Mock / no hardware"
			className={isAffected ? "affected-module" : ""}
		>
			<div className={styles.container}>
				<div className={styles.modeSummary}>
					<span className={styles.label}>Reported mode</span>
					<strong>{mode ? MODE_LABELS[mode] : "UNKNOWN"}</strong>
					<span className={styles.legend}>Green: report · Orange: request</span>
				</div>

				<div
					className={styles.modeButtons}
					aria-label="Request simulated stand mode"
				>
					{OPERATING_MODES.map((target) => {
						const assessment = evaluateModeTransition(mode, target, valves);
						const pending = activity.find(
							(request) => request.kind === "MODE" && request.target === target,
						);
						const blocked = target !== "SAFE" && pendingMode;
						const available = assessment.eligible && !blocked;
						const reported = mode === target;
						const disabled = !available || Boolean(pending);
						const status = pending
							? "Pending"
							: reported
								? "Reported"
								: available
									? "Available"
									: "Unavailable";
						return (
							<button
								key={target}
								type="button"
								className={`${styles.stateButton} ${styles.modeButton} ${buttonOutline(reported, Boolean(pending), available)}`}
								disabled={disabled}
								aria-pressed={reported}
								title={
									pending
										? "Awaiting mock response or report"
										: blocked
											? "Another mode request is pending"
											: assessment.reasons.join("; ") || status
								}
								onClick={() =>
									submitRequest(() => controller.requestMode(target))
								}
							>
								<span>{MODE_LABELS[target]}</span>
								<small>{status}</small>
							</button>
						);
					})}
				</div>

				<div className={styles.heading}>
					<strong>Valve controls</strong>
					<span className={styles.legend}>
						{permittedValves.length} available · report ≠ physical feedback
					</span>
				</div>
				{permittedValves.length === 0 ? (
					<p className={styles.empty}>
						Manual valve controls unavailable in this reported mode.
					</p>
				) : (
					<div className={styles.valveList}>
						{permittedValves.map(({ id, label }) => {
							const reported = valves?.[id] ?? "UNKNOWN";
							const pending = activity.find(
								(
									request,
								): request is Extract<CommandActivity, { kind: "VALVE" }> =>
									request.kind === "VALVE" && request.valve === id,
							);
							return (
								<div className={styles.valveRow} key={id}>
									<div className={styles.valveInfo}>
										<span className={styles.valveName}>
											{label} <span className={styles.valveId}>{id}</span>
										</span>
										<span className={styles.valveReport}>
											Reported: <strong>{reported}</strong>
											{pending ? " · Pending" : ""}
										</span>
									</div>
									<div className={styles.valveActions}>
										{(["OPEN", "CLOSED"] as const).map(
											(target: ValveTarget) => {
												const isPending = pending?.target === target;
												const isReported = reported === target;
												const status = isPending
													? "Pending"
													: isReported
														? "Reported"
														: "Available";
												return (
													<button
														key={target}
														type="button"
														className={`${styles.stateButton} ${styles.valveButton} ${buttonOutline(isReported, isPending, true)}`}
														disabled={Boolean(pending)}
														aria-pressed={isReported}
														aria-label={`${target === "OPEN" ? "Open" : "Close"} ${label} (mock); ${status}`}
														title={`${label}: ${target === "OPEN" ? "Open" : "Close"}. ${status}. Mock only.`}
														onClick={() =>
															submitRequest(() =>
																controller.requestValve(id, target),
															)
														}
													>
														{target === "OPEN" ? "Open" : "Close"}
													</button>
												);
											},
										)}
									</div>
								</div>
							);
						})}
					</div>
				)}

				{mode === "PRESSURIZATION_FIRE" && (
					<form
						className={styles.fireForm}
						onSubmit={(event) => {
							event.preventDefault();
							submitRequest(() => controller.requestFire(timing));
						}}
					>
						<div className={styles.heading}>
							<strong>Fire timing — simulation only</strong>
							<span className={styles.legend}>All values in µs</span>
						</div>
						<div className={styles.fireFields}>
							{(
								[
									["burn_time_micros", "Burn time"],
									["ignition_offset_micros", "Ignition offset"],
									["propellants_offset_micros", "Propellant offset"],
								] as const
							).map(([key, label]) => (
								<label key={key} className={styles.fireField}>
									<span>{label} (µs)</span>
									<input
										type="text"
										inputMode="numeric"
										value={fireInputs[key]}
										onChange={(event) =>
											setFireInputs((previous) => ({
												...previous,
												[key]: event.target.value,
											}))
										}
										placeholder="Required"
									/>
								</label>
							))}
						</div>
						{timingErrors.length > 0 && hasFireInput && (
							<span className={styles.validation}>
								{timingErrors.join("; ")}
							</span>
						)}
						<button
							className={styles.fireButton}
							type="submit"
							disabled={timingErrors.length > 0 || pendingFire || pendingMode}
							title="Send a mock Fire timing request; no firing sequence or hardware command executes"
						>
							{pendingFire ? "Fire request pending" : "Fire (mock only)"}
						</button>
						<span className={styles.fireNote}>
							Acknowledgment does not represent a firing or stand-state change.
						</span>
					</form>
				)}
				<p className={styles.requestStatus} role="status">
					{feedback()}
				</p>
			</div>
		</ModuleFrame>
	);
}
