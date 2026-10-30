import { useMemo, useState, useSyncExternalStore } from "react";
import { ModuleFrame } from "../../components/ModuleFrame";
import type { EventKind, OperatorEventLog } from "../../controller/OperatorEventLog";
import styles from "./OperatorEventsModule.module.css";

interface Props { log: OperatorEventLog; isAffected?: boolean }
const FILTERS = ["ALL", "REQUEST", "RESPONSE", "REPORT", "SYSTEM"] as const;
type Filter = (typeof FILTERS)[number];

/** Operator-visible event history; the backend remains responsible for durable logging. */
export function OperatorEventsModule({log,isAffected=false}: Props) {
  const entries = useSyncExternalStore(
    (callback) => log.subscribe(callback), () => log.snapshot(), () => [],
  );
  const [filter,setFilter] = useState<Filter>("ALL");
  const [query,setQuery] = useState("");
  const visible = useMemo(() => entries.filter((entry) =>
    (filter === "ALL" || entry.kind === filter as EventKind) &&
    `${entry.message} ${entry.commandId ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  ),[entries,filter,query]);
  function downloadCsv() {
    const csvValue = (value: string) => `"${value.replaceAll('"','""')}"`;
    const rows = ["timestamp,kind,severity,command_id,message", ...entries.map((event) =>
      [event.occurredAt,event.kind,event.severity,event.commandId ?? "",event.message].map(csvValue).join(","))];
    const url = URL.createObjectURL(new Blob([rows.join("\r\n")], {type:"text/csv;charset=utf-8"}));
    const link = document.createElement("a"); link.href=url; link.download="riverdash-operator-events.csv";
    link.click(); URL.revokeObjectURL(url);
  }
  return <ModuleFrame title="Operator event log" status="warning" statusLabel="Session only" className={isAffected ? "affected-module" : ""}>
    <div className={styles.container}>
      <div className={styles.filters}>
        <select aria-label="Filter event type" value={filter} onChange={e=>setFilter(e.target.value as Filter)}>
          {FILTERS.map(value=><option key={value} value={value}>{value}</option>)}
        </select>
        <input aria-label="Search events" placeholder="Search events" value={query} onChange={e=>setQuery(e.target.value)}/>
        <button onClick={downloadCsv} type="button">CSV</button>
      </div>
      <p className={styles.note}>Requests, simulated responses, and stand reports are distinct. This log is not persistent.</p>
      <ol className={styles.entries} aria-live="polite">
        {visible.length === 0 && <li>No matching events</li>}
        {visible.map(event=><li key={event.id} className={styles[event.severity]}>
          <div><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleTimeString()}</time> · {event.kind}{event.commandId ? ` · ${event.commandId}`:""}</div>
          <span>{event.message}</span>
        </li>)}
      </ol>
    </div>
  </ModuleFrame>;
}
