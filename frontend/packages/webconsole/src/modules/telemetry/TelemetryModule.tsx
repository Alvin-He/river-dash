import {
	forwardRef,
	useEffect,
	useId,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { ModuleFrame } from "../../components/ModuleFrame";
import { defaultReadings, demoTelemetryStream } from "./demoTelemetryStream";
import {
	isTelemetryChannelVisible,
	parseTelemetrySettings,
	readTelemetrySettings,
	setAllTelemetryChannelsVisible,
	setTelemetryChannelVisibility,
	writeTelemetrySettings,
	type TelemetrySettings,
} from "./telemetrySettings";
import styles from "./TelemetryModule.module.css";

export interface TelemetryReading {
	name: string;
	value: string;
	age: string;
}

/** Adapter shape for the eventual NILE Stand stream client. */
export interface TelemetryStream {
	subscribe: (onReadings: (readings: TelemetryReading[]) => void) => () => void;
}

interface TelemetryModuleProps {
	readings?: TelemetryReading[];
	stream?: TelemetryStream;
	isAffected?: boolean;
	storageKey?: string;
	title?: string;
	onRemove?: () => void;
}

export interface TelemetryModuleHandle {
	getSettings: () => TelemetrySettings;
	applySettings: (settings: TelemetrySettings) => void;
}

/** Toggle which channels are displayed without changing the incoming stream. */
export const TelemetryModule = forwardRef<
	TelemetryModuleHandle,
	TelemetryModuleProps
>(function TelemetryModule({ readings, stream, isAffected = false, storageKey, title = "Telemetry overview", onRemove }, ref) {
	const [streamReadings, setStreamReadings] = useState<TelemetryReading[]>(
		readings ?? defaultReadings,
	);
	const [settings, setSettings] = useState<TelemetrySettings>(
		() => readTelemetrySettings(storageKey),
	);
	const [channelsOpen, setChannelsOpen] = useState(false);
	const channelsId = useId();
	const channelsButtonRef = useRef<HTMLButtonElement>(null);
	const channelsPanelRef = useRef<HTMLElement>(null);

	useImperativeHandle(
		ref,
		() => ({
			getSettings: () => settings,
			applySettings: (next) => {
				setSettings(parseTelemetrySettings(next));
				setChannelsOpen(false);
			},
		}),
		[settings],
	);

	useEffect(() => {
		if (!stream) return;
		return stream.subscribe(setStreamReadings);
	}, [stream]);
	useEffect(() => writeTelemetrySettings(settings, storageKey), [settings, storageKey]);
	useEffect(() => {
		if (channelsOpen) channelsPanelRef.current?.focus();
	}, [channelsOpen]);

	const activeReadings = stream
		? streamReadings
		: (readings ?? defaultReadings);
	const sortedReadings = useMemo(
		() =>
			[...activeReadings].sort((first, second) =>
				first.name.localeCompare(second.name),
			),
		[activeReadings],
	);
	const usesDemoReadings =
		stream === demoTelemetryStream || (!stream && !readings);
	const visibleReadings = sortedReadings.filter((reading) =>
		isTelemetryChannelVisible(settings, reading.name),
	);

	return (
		<ModuleFrame
			title={title}
			status={stream && !usesDemoReadings ? "live" : "idle"}
			statusLabel={usesDemoReadings ? "Demo" : stream ? "Stream" : "Data"}
			actions={<>
				<button
					ref={channelsButtonRef}
					className={styles.channelsTrigger}
					type="button"
					aria-expanded={channelsOpen}
					aria-controls={channelsId}
					onClick={() => setChannelsOpen((open) => !open)}
				>
					{channelsOpen ? "Close" : "Channels"}
				</button>
				{onRemove && <button className={styles.channelsTrigger} type="button" onClick={onRemove} aria-label={`Remove ${title}`} title={`Remove ${title}`}>×</button>}
			</>}
			className={isAffected ? "affected-module" : ""}
		>
			<div className={styles.telemetry}>
				<div className={styles.summary}>
					<span>STAND / TELEMETRY</span>
					<strong>
						{visibleReadings.length} / {sortedReadings.length} CHANNELS
					</strong>
				</div>

				<div
					className={styles.table}
					role="table"
					aria-label="Telemetry values"
				>
					<div className={`${styles.row} ${styles.tableHead}`} role="row">
						<span role="columnheader">CHANNEL</span>
						<span role="columnheader">VALUE</span>
						<span role="columnheader">AGE</span>
					</div>

					{visibleReadings.map((reading) => (
						<div className={styles.row} role="row" key={reading.name}>
							<span className={styles.channel} role="cell" title={reading.name}>
								{reading.name}
							</span>
							<span className={styles.value} role="cell">
								{reading.value}
							</span>
							<span role="cell">{reading.age}</span>
						</div>
					))}
					{visibleReadings.length === 0 && (
						<div className={styles.empty} role="row">
							<span role="cell">
								{sortedReadings.length === 0
									? "No telemetry channels available."
									: "All channels hidden. Open Channels to show them."}
							</span>
						</div>
					)}
				</div>

				<p className={styles.footer}>
					Showing {visibleReadings.length} of {sortedReadings.length} channels ·
					Sorted by channel name
				</p>

				{channelsOpen && (
					<aside
						ref={channelsPanelRef}
						tabIndex={-1}
						id={channelsId}
						className={styles.channelsPanel}
						aria-label="Telemetry channel visibility"
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								event.stopPropagation();
								setChannelsOpen(false);
								channelsButtonRef.current?.focus();
							}
						}}
					>
						<div className={styles.channelsHeading}>
							<strong>Visible channels</strong>
							<button
								type="button"
								aria-label="Close telemetry channel settings"
								onClick={() => {
									setChannelsOpen(false);
									channelsButtonRef.current?.focus();
								}}
							>
								×
							</button>
						</div>
						<p className={styles.channelsHint}>
							Select the measurements shown in this table. Incoming data is
							unaffected.
						</p>
						<div className={styles.channelsActions}>
							<button
								type="button"
								disabled={
									visibleReadings.length === sortedReadings.length &&
									Object.keys(settings.channels).length === 0
								}
								onClick={() =>
									setSettings((current) =>
										setAllTelemetryChannelsVisible(current, [], true),
									)
								}
							>
								Show all
							</button>
							<button
								type="button"
								disabled={
									sortedReadings.length === 0 || visibleReadings.length === 0
								}
								onClick={() =>
									setSettings((current) =>
										setAllTelemetryChannelsVisible(
											current,
											sortedReadings.map((reading) => reading.name),
											false,
										),
									)
								}
							>
								Hide all
							</button>
						</div>
						<div className={styles.channelsList}>
							{sortedReadings.length === 0 ? (
								<p className={styles.channelsHint}>
									No channels available yet.
								</p>
							) : (
								sortedReadings.map((reading) => (
									<label
										className={styles.channelsOption}
										key={reading.name}
										title={reading.name}
									>
										<input
											type="checkbox"
											checked={isTelemetryChannelVisible(
												settings,
												reading.name,
											)}
											onChange={(event) =>
												setSettings((current) =>
													setTelemetryChannelVisibility(
														current,
														reading.name,
														event.target.checked,
													),
												)
											}
										/>
										<span>{reading.name}</span>
									</label>
								))
							)}
						</div>
					</aside>
				)}
			</div>
		</ModuleFrame>
	);
});
