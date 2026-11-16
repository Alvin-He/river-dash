import { useMemo } from "react";
import {
  PIDViewer,
  createRiverDashSource,
  parseDiagram
} from "@de-nile/pid-viewer";
import config from "@de-nile/pid-viewer/team-example";
import "@de-nile/pid-viewer/style.css";
import { GDT } from "@river-dash/global-data-source";

// Demo bindings only. Copy config to a local JSON file and replace the bindings
// after the telemetry topic names, units and state values are agreed.
const diagram = parseDiagram(config);

export function DiagramPanel() {
  // Use RiverDash's existing table, never create another connection here.
  const source = useMemo(
    () =>
      createRiverDashSource(GDT, "R", { staleAfterMs: 5000 }),
    []
  );
  return (
    <div
      style={{ width: "100%", height: "100%", minHeight: 500 }}>
      <PIDViewer
        diagram={diagram}
        presentation="symbols"
        dataSource={source}
      />
    </div>
  );
}
