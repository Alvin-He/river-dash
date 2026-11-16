import { useMemo, useState, useSyncExternalStore } from "react";
import { ModuleFrame } from "../../components/ModuleFrame";
import type {
	OperatorEvent,
	OperatorEventLog,
} from "../../controller/OperatorEventLog";
import styles from "./OperatorEventsModule.module.css";

interface Props {
	log: OperatorEventLog;
	isAffected?: boolean;
}

const FILTERS = ["ALL", "REQUEST", "RESPONSE", "REPORT", "SYSTEM"] as const;
type Filter = (typeof FILTERS)[number];

/** Stable fallback snapshot for server rendering. */
const EMPTY_EVENTS: readonly OperatorEvent[] = [];

/**
 * Displays the in-memory operator event history.
 *
 * Events are recorded by the shared controller/log; filtering affects only this
 * view. The backend is responsible for persistent logging and replay.
 */
export function OperatorEventsModule({ log, isAffected = false }: Props) {
	// Subscribe to the shared log so new command and stand events trigger renders.
	const entries = useSyncExternalStore(
		(onChange) => log.subscribe(onChange),
		() => log.snapshot(),
		() => EMPTY_EVENTS,
	);
	const [filter, setFilter] = useState<Filter>("ALL");
	const [query, setQuery] = useState("");

	const visibleEvents = useMemo(() => {
		const searchText = query.trim().toLowerCase();
		return entries.filter((event) => {
			const matchesKind = filter === "ALL" || event.kind === filter;
			const searchableText =
				`${event.message} ${event.commandId ?? ""}`.toLowerCase();
			return matchesKind && searchableText.includes(searchText);
		});
	}, [entries, filter, query]);

	return (
		<ModuleFrame
			title="Operator event log"
			status="idle"
			statusLabel="Session history"
			className={isAffected ? "affected-module" : ""}
		>
			<div className={styles.container}>
				<div className={styles.filters}>
					<select
						aria-label="Filter event type"
						value={filter}
						onChange={(event) => setFilter(event.target.value as Filter)}
					>
						{FILTERS.map((value) => (
							<option key={value} value={value}>
								{value === "ALL" ? "All events" : value}
							</option>
						))}
					</select>
					<input
						aria-label="Search events"
						placeholder="Search messages / IDs"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>

				{/* Keep this summary visible even when a small panel clips its event list. */}
				<div className={styles.summary} aria-live="polite">
					{visibleEvents.length} of {entries.length} events
					<span>Session only</span>
				</div>

				<ol className={styles.entries} aria-label="Operator event history">
					{visibleEvents.length === 0 && (
						<li className={styles.empty}>
							{entries.length === 0
								? "No events recorded yet"
								: "No matching events"}
						</li>
					)}
					{visibleEvents.map((event) => (
						<li key={event.id} className={styles[event.severity]}>
							<div className={styles.meta}>
								<time dateTime={event.occurredAt}>
									{new Date(event.occurredAt).toLocaleTimeString()}
								</time>
								<strong>{event.kind}</strong>
								{event.commandId && <span>{event.commandId}</span>}
							</div>
							<span className={styles.message}>{event.message}</span>
						</li>
					))}
				</ol>
			</div>
		</ModuleFrame>
	);
}
