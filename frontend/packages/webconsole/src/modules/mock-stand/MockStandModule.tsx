import { useEffect, useState } from "react";
import { ModuleFrame } from "../../components/ModuleFrame";
import {
	OPERATING_MODES,
	VALVES,
	useStandMode,
	type OperatingMode,
	type PendingMockRequest,
	type AcceptedMockMode,
	type AcceptedMockValve,
	type StandSimulator,
	type UIController,
	type ValveId,
	type ValveState,
} from "../../controller";
import styles from "./MockStandModule.module.css";

interface Props {
	controller: UIController;
	simulator: StandSimulator;
	isAffected?: boolean;
}

function describeRequest(command: PendingMockRequest): string {
	switch (command.kind) {
		case "MODE":
			return `${command.id}: Request ${command.mode}`;
		case "VALVE":
			return `${command.id}: ${command.valve} → ${command.target}`;
		case "FIRE":
			return `${command.id}: Mock Fire timing request (no hardware)`;
	}
}

/** Manual simulator controls; never represent actual NILE stand operations. */
export function MockStandModule({
	controller,
	simulator,
	isAffected = false,
}: Props) {
	const mode = useStandMode(controller);
	const [autoProcessing, setAutoProcessing] = useState(() =>
		simulator.isAutoProcessing(),
	);
	const [valve, setValve] = useState<ValveId>(VALVES[0].id);
	const [state, setState] = useState<ValveState>("CLOSED");
	const [pending, setPending] = useState<readonly PendingMockRequest[]>(() =>
		simulator.getPendingRequests(),
	);
	const [acceptedModes, setAcceptedModes] = useState<
		readonly AcceptedMockMode[]
	>(() => simulator.getAcceptedModeReports());
	const [acceptedValves, setAcceptedValves] = useState<
		readonly AcceptedMockValve[]
	>(() => simulator.getAcceptedValveReports());
	const [feedback, setFeedback] = useState("");

	useEffect(
		() =>
			simulator.subscribeToQueue(() => {
				setPending(simulator.getPendingRequests());
				setAcceptedModes(simulator.getAcceptedModeReports());
				setAcceptedValves(simulator.getAcceptedValveReports());
			}),
		[simulator],
	);

	function changeAutoProcessing(enabled: boolean): void {
		simulator.setAutoProcessing(enabled);
		setAutoProcessing(enabled);
		setFeedback(
			enabled
				? "Auto demo enabled: requests receive mock responses and later simulated reports"
				: "Manual demo enabled: evaluate requests and publish reports separately",
		);
	}

	function respond(shouldAccept: boolean): void {
		const result = simulator.respondToPending(shouldAccept);
		setFeedback(result?.message ?? "No requests waiting");
	}

	function reportAcceptedMode(): void {
		const report = simulator.publishAcceptedModeReport();
		setFeedback(
			report
				? `Simulated stand reported ${report.mode} (request ${report.id})`
				: "No accepted mode request awaiting a report",
		);
	}

	function reportAcceptedValve(): void {
		const report = simulator.publishAcceptedValveReport();
		setFeedback(
			report
				? `Simulated valve report ${report.valve}=${report.target} (request ${report.id})`
				: "No accepted valve request awaiting a report",
		);
	}

	return (
		<ModuleFrame
			title="Mock stand simulator"
			status="warning"
			statusLabel="Simulation"
			className={isAffected ? "affected-module" : ""}
		>
			<div className={styles.content}>
				<p>
					Simulation only. Requests, responses, and stand reports are separate;
					no hardware commands are sent.
				</p>
				<label className={styles.autoMode}>
					<input
						type="checkbox"
						checked={autoProcessing}
						onChange={(event) => changeAutoProcessing(event.target.checked)}
					/>
					Auto-process mock commands and publish simulated reports
				</label>
				<p>
					{autoProcessing
						? "Mode and valve buttons now update simulated reports automatically. Disable auto mode to test delays and rejections."
						: "Manual mode: evaluate requests, then publish accepted reports to update the UI."}
				</p>

				<label htmlFor="mock-stand-mode">Reported mode</label>
				<select
					id="mock-stand-mode"
					value={mode ?? ""}
					onChange={(event) =>
						simulator.reportMode(event.target.value as OperatingMode)
					}
				>
					<option value="" disabled>
						Unknown
					</option>
					{OPERATING_MODES.map((value) => (
						<option value={value} key={value}>
							{value}
						</option>
					))}
				</select>
				<button type="button" onClick={() => simulator.reportMode("SAFE")}>
					Simulate stand entering SAFE
				</button>
				<button type="button" onClick={() => simulator.clearReportedMode()}>
					Clear mode report
				</button>

				<label htmlFor="mock-valve">Valve report</label>
				<select
					id="mock-valve"
					value={valve}
					onChange={(event) => setValve(event.target.value as ValveId)}
				>
					{VALVES.map(({ id, label }) => (
						<option key={id} value={id}>
							{label}
						</option>
					))}
				</select>
				<select
					aria-label="Valve state to report"
					value={state}
					onChange={(event) => setState(event.target.value as ValveState)}
				>
					{(["OPEN", "CLOSED", "UNKNOWN"] as const).map((value) => (
						<option value={value} key={value}>
							{value}
						</option>
					))}
				</select>
				<button
					type="button"
					onClick={() => simulator.reportValve(valve, state)}
				>
					Publish valve report
				</button>
				<button type="button" onClick={() => simulator.clearValveReports()}>
					Clear valve reports
				</button>

				{autoProcessing ? (
					<p role="status">
						Mock processing: {pending.length} queued,{" "}
						{acceptedModes.length + acceptedValves.length} awaiting separate
						reports.
					</p>
				) : (
					<>
						<label>Queued mock commands ({pending.length})</label>
						<p role="status">
							{pending.length > 0
								? pending.map(describeRequest).join(" · ")
								: "No pending requests"}
						</p>
						<button
							type="button"
							disabled={pending.length === 0}
							onClick={() => respond(true)}
						>
							Evaluate next request (mock)
						</button>
						<button
							type="button"
							disabled={pending.length === 0}
							onClick={() => respond(false)}
						>
							Reject next request (mock)
						</button>
						<label>
							Accepted modes awaiting reports ({acceptedModes.length})
						</label>
						<p>
							{acceptedModes.length > 0
								? acceptedModes
										.map(({ id, mode: target }) => `${id}: ${target}`)
										.join(" · ")
								: "None"}
						</p>
						<button
							type="button"
							disabled={acceptedModes.length === 0}
							onClick={reportAcceptedMode}
						>
							Publish accepted mode report (mock)
						</button>
						<label>
							Accepted valves awaiting reports ({acceptedValves.length})
						</label>
						<p>
							{acceptedValves.length > 0
								? acceptedValves
										.map(
											({ id, valve: idValve, target }) =>
												`${id}: ${idValve} → ${target}`,
										)
										.join(" · ")
								: "None"}
						</p>
						<button
							type="button"
							disabled={acceptedValves.length === 0}
							onClick={reportAcceptedValve}
						>
							Publish accepted valve report (mock)
						</button>
					</>
				)}
				{feedback && <p role="status">{feedback}</p>}
			</div>
		</ModuleFrame>
	);
}
