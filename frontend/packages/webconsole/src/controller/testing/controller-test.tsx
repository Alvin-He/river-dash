/** Deterministic, development-only controller fixture for real browser UI tests. */
import { createRoot } from "react-dom/client";
import { MockStand, MockTopicStore, OperatorEventLog, TopicUIController } from "..";
import { ModeControlsModule } from "../../modules/mode-controls/ModeControlsModule";
import { MockStandModule } from "../../modules/mock-stand/MockStandModule";
import "../../styles/consoleBase.css";

const topics = new MockTopicStore();
const log = new OperatorEventLog();
const controller = new TopicUIController(topics, topics, log);
const stand = new MockStand(topics, { autoProcess: false });
stand.reportMode("CHECKOUT");
stand.reportValve("OF", "CLOSED");

createRoot(document.getElementById("root")!).render(
  <main style={{ display: "grid", gap: 24, padding: 24, gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))" }}>
    <section aria-label="Operator controls">
      <ModeControlsModule controller={controller} />
    </section>
    <section aria-label="Simulated stand controls">
      <MockStandModule controller={controller} simulator={stand} />
    </section>
  </main>,
);
