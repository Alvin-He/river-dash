import { evaluateModeTransition } from "./modeRules";
import { isOperatingMode, isValveId, TOPICS, type OperatingMode,
  type TopicReader, type TopicWriter, type Unsubscribe, type ValveId,
  type ValveStates, type CommandResponse } from "./topics";
import type { OperatorEventLog } from "./OperatorEventLog";

/** The UI depends on this interface, never on another module or the mock store. */
export interface UIController {
  getReportedMode(): OperatingMode | null;
  subscribeToMode(callback: (mode: OperatingMode | null) => void): Unsubscribe;
  getValveStates(): ValveStates | null;
  subscribeToValves(callback: (states: ValveStates | null) => void): Unsubscribe;
  requestMode(mode: OperatingMode): void;
  requestValve(valve: ValveId, target: "OPEN" | "CLOSED"): void;
}

/**
 * Transport-facing facade. Requests are NEVER acknowledgments or state reports.
 * The backend, not this frontend, must enforce mode transitions and interlocks.
 */
export class TopicUIController implements UIController {
  private nextCommandId = 1;
  private readonly reader: TopicReader;
  private readonly writer: TopicWriter;
  private readonly events: OperatorEventLog;
  constructor(reader: TopicReader, writer: TopicWriter, events: OperatorEventLog) {
    this.reader = reader; this.writer = writer; this.events = events;
    reader.subscribe(TOPICS.reportedMode, (mode) => {
      events.record("REPORT", `Stand mode report: ${mode ?? "UNAVAILABLE"}`, mode ? "info" : "warning");
    });
    reader.subscribe(TOPICS.valveStates, (states) => {
      if (states) events.record("REPORT", `Valve state report: ${Object.entries(states).map(([id, value]) => `${id}=${value}`).join(", ")}`);
      else events.record("SYSTEM", "Valve state report unavailable", "warning");
    });
    reader.subscribe(TOPICS.commandResponse, (response) => {
      if (response) this.recordResponse(response);
    });
  }
  getReportedMode(): OperatingMode | null {
    const value = this.reader.read(TOPICS.reportedMode);
    return isOperatingMode(value) ? value : null;
  }
  subscribeToMode(callback: (mode: OperatingMode | null) => void): Unsubscribe {
    return this.reader.subscribe(TOPICS.reportedMode, (value) => callback(isOperatingMode(value) ? value : null));
  }
  getValveStates(): ValveStates | null { return this.reader.read(TOPICS.valveStates) ?? null; }
  subscribeToValves(callback: (states: ValveStates | null) => void): Unsubscribe {
    return this.reader.subscribe(TOPICS.valveStates, (states) => callback(states ?? null));
  }
  requestMode(mode: OperatingMode): void {
    if (!isOperatingMode(mode)) throw new Error("Unrecognized stand mode");
    // Advisory only. The mock topic does not represent an authoritative stand command.
    // SAFE bypasses ordinary mode requirements even if reports are unavailable.
    const assessment = evaluateModeTransition(this.getReportedMode(), mode, this.getValveStates());
    if (!assessment.eligible) {
      const reason = assessment.reasons.join("; ");
      this.events.record("SYSTEM", `Mode request not sent: ${reason}`, "info");
      throw new Error(reason);
    }
    const id = this.commandId();
    this.writer.publish(TOPICS.requestedMode, { id, mode });
    this.events.record("REQUEST", `Mode change requested: ${mode} (not confirmed)`, "info", id);
  }
  requestValve(valve: ValveId, target: "OPEN" | "CLOSED"): void {
    if (!isValveId(valve) || (target !== "OPEN" && target !== "CLOSED")) throw new Error("Invalid valve request");
    // UI restriction improves usability; actual authorization belongs to the stand.
    const mode = this.getReportedMode();
    if (!canRequestValve(mode, valve)) throw new Error("Valve control unavailable in current mode");
    const id = this.commandId();
    this.writer.publish(TOPICS.valveRequest, { id, valve, target });
    this.events.record("REQUEST", `${valve}: ${target} requested (not confirmed)`, "info", id);
  }
  private commandId(): string { return `demo-${this.nextCommandId++}`; }
  private recordResponse(response: CommandResponse): void {
    this.events.record("RESPONSE", `${response.accepted ? "Accepted" : "Rejected"}: ${response.message}`,
      response.accepted ? "info" : "error", response.id);
  }
}

/** Provisional frontend availability; not the physical stand's command interlocks. */
export function canRequestValve(mode: OperatingMode | null, valve: ValveId): boolean {
  if (mode === "CHECKOUT") return true;
  if (mode === "OX_FILL") return valve === "OF" || valve === "OV";
  return false;
}
