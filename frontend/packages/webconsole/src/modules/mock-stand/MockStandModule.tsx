import { useState } from "react";
import { ModuleFrame } from "../../components/ModuleFrame";
import { OPERATING_MODES, VALVES, useStandMode, type OperatingMode,
  type StandSimulator, type UIController, type ValveId } from "../../controller";
import styles from "./MockStandModule.module.css";

interface Props { controller: UIController; simulator: StandSimulator; isAffected?: boolean }
/** Development-only controls. Never bundle this as a real stand controller. */
export function MockStandModule({controller,simulator,isAffected=false}: Props) {
  const mode = useStandMode(controller);
  const [valve, setValve] = useState<ValveId>(VALVES[0].id);
  const [state, setState] = useState<"OPEN" | "CLOSED" | "UNKNOWN">("CLOSED");
  return <ModuleFrame title="Mock stand simulator" status="warning" statusLabel="Simulation" className={isAffected ? "affected-module" : ""}>
    <div className={styles.content}>
      <p>Stand-originated reports, not physical actuation. Responses do not automatically change reports.</p>
      <label htmlFor="mock-stand-mode">Reported mode</label>
      <select id="mock-stand-mode" value={mode ?? ""} onChange={event=>simulator.reportMode(event.target.value as OperatingMode)}>
        <option value="" disabled>Unknown</option>{OPERATING_MODES.map(value=><option value={value} key={value}>{value}</option>)}
      </select>
      <button onClick={()=>simulator.reportMode("SAFE")}>Simulate stand entering SAFE</button>
      <button onClick={()=>simulator.clearReportedMode()}>Clear mode report</button>
      <label htmlFor="mock-valve">Valve report</label>
      <select id="mock-valve" value={valve} onChange={event=>setValve(event.target.value as ValveId)}>
        {VALVES.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <select aria-label="Valve state to report" value={state} onChange={event=>setState(event.target.value as typeof state)}>
        {(["OPEN","CLOSED","UNKNOWN"] as const).map(value=><option key={value}>{value}</option>)}
      </select>
      <button onClick={()=>simulator.reportValve(valve,state)}>Publish valve report</button>
      <button onClick={()=>simulator.clearValveReports()}>Clear valve reports</button>
      <label>Respond to most recent request (mock only)</label>
      <button onClick={()=>simulator.respondToPending(true)}>Simulate accepted response</button>
      <button onClick={()=>simulator.respondToPending(false)}>Simulate rejected response</button>
    </div>
  </ModuleFrame>;
}
