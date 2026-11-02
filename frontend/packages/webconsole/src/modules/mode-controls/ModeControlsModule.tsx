import { useEffect, useState } from "react";
import { ModuleFrame } from "../../components/ModuleFrame";
import { canRequestValve } from "../../controller/UIController";
import { evaluateModeTransition } from "../../controller/modeRules";
import {
  useStandMode, OPERATING_MODES, VALVES, type UIController,
  type OperatingMode, type ValveStates
} from "../../controller";
import styles from "./ModeControlsModule.module.css";

interface Props { controller: UIController; isAffected?: boolean }

/** Operator requests never imply physical actuation or a successful mode change. */
export function ModeControlsModule({ controller, isAffected = false }: Props) {
  const mode = useStandMode(controller);
  const [valves, setValves] = useState<ValveStates | null>(() => controller.getValveStates());
  const [feedback, setFeedback] = useState("No commands requested this session");
  // The valve reports can arrive independently of mode changes.
  // useSyncExternalStore is not needed here because the subscription supplies a snapshot.
  useEffect(() => controller.subscribeToValves(setValves), [controller]);

  function requestMode(next: OperatingMode) {
    try { controller.requestMode(next); setFeedback(`Requested ${next}; awaiting stand report`); }
    catch (error) { setFeedback(String(error)); }
  }
  function requestValve(id: (typeof VALVES)[number]["id"], target: "OPEN" | "CLOSED") {
    try { controller.requestValve(id, target); setFeedback(`${id} ${target} requested; unconfirmed`); }
    catch (error) { setFeedback(String(error)); }
  }
  return <ModuleFrame title="Mode & valve control" status="warning" statusLabel="Mock / no hardware" className={isAffected ? "affected-module" : ""}>
    <div className={styles.container}>
      <div className={styles.section}><span className={styles.label}>STAND-REPORTED MODE</span><strong className={styles.value}>{mode ?? "UNKNOWN"}</strong></div>
      <p className={styles.note}>Requests only. Reported mode and valve positions come from separate stand topics. SAFE is not a guarantee that every valve closes.</p>
      <div className={styles.buttons}>
        {OPERATING_MODES.map((target) => {
          const assessment = evaluateModeTransition(mode, target, valves);
          return <button key={target} type="button"
            className={target === "SAFE" ? styles.safeButton : styles.modeButton}
            disabled={!assessment.eligible}
            title={assessment.reasons.join("; ") || undefined}
            onClick={() => requestMode(target)}>Request {target.replaceAll("_", " ")}</button>;
        })}
      </div>
      <strong className={styles.label}>VALVE CONTROLS · REPORTED STATE</strong>
      <div className={styles.valveList}>
        {VALVES.map(({ id, label }) => <div className={styles.valveRow} key={id}>
          <span>{label}</span><strong>{valves?.[id] ?? "UNKNOWN"}</strong>
          <button type="button" disabled={!canRequestValve(mode, id)} onClick={() => requestValve(id, "OPEN")}>Open</button>
          <button type="button" disabled={!canRequestValve(mode, id)} onClick={() => requestValve(id, "CLOSED")}>Close</button>
        </div>)}
      </div>
      <p className={styles.requestStatus} role="status">{feedback}</p>
    </div>
  </ModuleFrame>;
}