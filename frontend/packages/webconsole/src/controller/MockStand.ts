import { TOPICS, VALVES, type OperatingMode, type TopicReader, type TopicWriter,
  type ValveId, type ValveStates } from "./topics";

export interface StandSimulator {
  reportMode(mode: OperatingMode): void;
  clearReportedMode(): void;
  reportValve(valve: ValveId, state: "OPEN" | "CLOSED" | "UNKNOWN"): void;
  clearValveReports(): void;
  respondToPending(accepted: boolean): void;
}
/** No automatic acceptance: operator can inspect and respond to the latest demo request. */
export class MockStand implements StandSimulator {
  private readonly topics: TopicReader & TopicWriter & {clear(topic: typeof TOPICS.reportedMode | typeof TOPICS.valveStates): void};
  constructor(topics: TopicReader & TopicWriter & {clear(topic: typeof TOPICS.reportedMode | typeof TOPICS.valveStates): void}) { this.topics = topics; }
  reportMode(mode: OperatingMode): void { this.topics.publish(TOPICS.reportedMode, mode); }
  clearReportedMode(): void { this.topics.clear(TOPICS.reportedMode); }
  reportValve(valve: ValveId, state: "OPEN" | "CLOSED" | "UNKNOWN"): void {
    const current = this.topics.read(TOPICS.valveStates) ?? this.emptyValves();
    this.topics.publish(TOPICS.valveStates, { ...current, [valve]: state });
  }
  clearValveReports(): void { this.topics.clear(TOPICS.valveStates); }
  respondToPending(accepted: boolean): void {
    const mode = this.topics.read(TOPICS.requestedMode);
    const valve = this.topics.read(TOPICS.valveRequest);
    // Latest request is chosen by sequence embedded in demo command IDs.
    const idValue = (id: string | undefined) => Number(id?.split("-")[1] ?? 0);
    const command = idValue(mode?.id) >= idValue(valve?.id) ? mode : valve;
    if (!command) return;
    this.topics.publish(TOPICS.commandResponse, {
      id: command.id, accepted,
      message: accepted ? "Mock accepted request; stand state NOT changed" : "Mock rejected request",
    });
  }
  private emptyValves(): ValveStates {
    return Object.fromEntries(VALVES.map(({id}) => [id, "UNKNOWN"])) as ValveStates;
  }
}
