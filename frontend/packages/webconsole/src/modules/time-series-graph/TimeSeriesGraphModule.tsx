import {
	forwardRef,
	useEffect,
	useId,
	useImperativeHandle,
	useMemo,
	useState,
} from "react";
import { ModuleFrame } from "../../components/ModuleFrame";
import { createDemoGraphSeries, demoGraphStream } from "./demoGraphStream";
import { GraphPlot } from "./GraphPlot";
import {
	getGraphScale,
	getManualGraphScale,
	panYRange,
	pointsInTimeRange,
	zoomYRange,
} from "./graphMath";
import type { AxisRange } from "./graphMath";
import {
	clampNumber,
	defaultChannelSettings,
	GRAPH_PALETTE,
	MAX_OFFSET_SECONDS,
	MAX_WINDOW_SECONDS,
	MIN_WINDOW_SECONDS,
	parseGraphSettings,
	readGraphSettings,
	writeGraphSettings,
} from "./graphSettings";
import type { GraphSettings, ChannelDisplaySettings } from "./graphSettings";
import styles from "./TimeSeriesGraphModule.module.css";
import type { GraphDataStream, GraphLineStyle, GraphSeries } from "./types";

interface TimeSeriesGraphModuleProps {
	series?: GraphSeries[];
	stream?: GraphDataStream;
	isAffected?: boolean;
	storageKey?: string;
	title?: string;
	onRemove?: () => void;
}

export interface TimeSeriesGraphHandle {
	getSettings: () => GraphSettings;
	applySettings: (settings: GraphSettings) => void;
}

/** A buffered numeric input permits intermediate edits like an empty field or "1". */
function NumberSetting({
	value,
	min,
	max,
	placeholder,
	onCommit,
}: {
	value: number | null;
	min: number;
	max: number;
	placeholder?: string;
	onCommit: (value: number | null) => void;
}) {
	const [draft, setDraft] = useState(value === null ? "" : String(value));
	function commit() {
		if (draft.trim() === "" && (value === null || min === 1)) {
			onCommit(null);
			return;
		}
		const parsed = Number(draft);
		if (!draft.trim() || !Number.isFinite(parsed)) {
			setDraft(value === null ? "" : String(value));
			return;
		}
		onCommit(clampNumber(Math.round(parsed), min, max));
	}
	return (
		<input
			type="number"
			min={min}
			max={max}
			step="1"
			placeholder={placeholder}
			value={draft}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === "Enter") event.currentTarget.blur();
			}}
		/>
	);
}

const LINE_STYLES: { label: string; value: GraphLineStyle }[] = [
	{ label: "Solid", value: "solid" },
	{ label: "Dashed", value: "dash" },
	{ label: "Dotted", value: "dot" },
	{ label: "Dash-dot", value: "dash-dot" },
];

export const TimeSeriesGraphModule = forwardRef<
	TimeSeriesGraphHandle,
	TimeSeriesGraphModuleProps
>(function TimeSeriesGraphModule(
	{ series, stream = demoGraphStream, isAffected = false, storageKey, title = "Time series graphs", onRemove },
	ref,
) {
	const [streamSeries, setStreamSeries] = useState<GraphSeries[]>(
		() => series ?? createDemoGraphSeries(),
	);
	const [settings, setSettings] = useState<GraphSettings>(() => readGraphSettings(undefined, storageKey));
	const settingsId = useId();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [frozenLatest, setFrozenLatest] = useState<number | null>(null);
	const [initialTimestamp] = useState(() => Date.now());
	const [yMinimumDraft, setYMinimumDraft] = useState("");
	const [yMaximumDraft, setYMaximumDraft] = useState("");
	const [axisError, setAxisError] = useState("");
	useImperativeHandle(
		ref,
		() => ({
			getSettings: () => settings,
			applySettings: (next) => {
				setSettings(parseGraphSettings(next));
				setFrozenLatest(null);
				setSettingsOpen(false);
				setAxisError("");
			},
		}),
		[settings],
	);

	useEffect(() => stream?.subscribe(setStreamSeries), [stream]);
	useEffect(() => writeGraphSettings(settings, undefined, storageKey), [settings, storageKey]);

	const availableSeries = series ?? streamSeries;
	const latestTimestamp =
		availableSeries.reduce((latest, current) => {
			const last = current.points.at(-1)?.timestamp;
			return typeof last === "number" && Number.isFinite(last)
				? Math.max(latest, last)
				: latest;
		}, 0) || initialTimestamp;
	const viewEnd =
		(frozenLatest ?? latestTimestamp) - settings.endOffsetSeconds * 1000;
	const viewStart = viewEnd - settings.windowSeconds * 1000;

	const selectedSeries = useMemo(
		() =>
			availableSeries
				.map((current, index) => ({
					...current,
					...defaultChannelSettings(current, index),
					...settings.channels[current.channel],
				}))
				.filter((current) => current.visible),
		[availableSeries, settings.channels],
	);

	const visiblePoints = useMemo(
		() =>
			selectedSeries.flatMap((current) =>
				pointsInTimeRange(current.points, viewStart, viewEnd).filter(
					(point) => point.timestamp >= viewStart && point.timestamp <= viewEnd,
				),
			),
		[selectedSeries, viewStart, viewEnd],
	);
	const autoScale = useMemo(
		() => getGraphScale(visiblePoints),
		[visiblePoints],
	);
	const scale = settings.yRange
		? getManualGraphScale(settings.yRange)
		: autoScale;

	const displayedUnits = new Set(selectedSeries.map((current) => current.unit));
	const mixedUnits = displayedUnits.size > 1;

	function changeSettings(updater: (current: GraphSettings) => GraphSettings) {
		setSettings((current) => updater(current));
	}

	function setChannel(
		channel: GraphSeries,
		index: number,
		update: Partial<ChannelDisplaySettings>,
	) {
		changeSettings((current) => ({
			...current,
			channels: {
				...current.channels,
				[channel.channel]: {
					...defaultChannelSettings(channel, index),
					...current.channels[channel.channel],
					...update,
				},
			},
		}));
	}

	function updateYRange(transform: (range: AxisRange) => AxisRange) {
		changeSettings((current) => ({
			...current,
			yRange: transform(current.yRange ?? autoScale),
		}));
	}

	function zoomX(factor: number) {
		changeSettings((current) => ({
			...current,
			windowSeconds: clampNumber(
				Math.round(current.windowSeconds * factor),
				MIN_WINDOW_SECONDS,
				MAX_WINDOW_SECONDS,
			),
		}));
	}

	function panX(fraction: number) {
		changeSettings((current) => ({
			...current,
			endOffsetSeconds: clampNumber(
				Math.round(current.endOffsetSeconds + current.windowSeconds * fraction),
				0,
				MAX_OFFSET_SECONDS,
			),
		}));
	}

	function openSettings() {
		if (!settingsOpen) {
			setYMinimumDraft(String(scale.minimum));
			setYMaximumDraft(String(scale.maximum));
			setAxisError("");
		}
		setSettingsOpen((open) => !open);
	}

	function applyYLimits() {
		const minimum = Number(yMinimumDraft);
		const maximum = Number(yMaximumDraft);
		if (
			!yMinimumDraft.trim() ||
			!yMaximumDraft.trim() ||
			!Number.isFinite(minimum) ||
			!Number.isFinite(maximum) ||
			minimum >= maximum ||
			Math.abs(minimum) >= 1e10 ||
			Math.abs(maximum) >= 1e10 ||
			maximum - minimum <= 1e-8
		) {
			setAxisError("Enter a Y minimum smaller than its maximum.");
			return;
		}
		setAxisError("");
		changeSettings((current) => ({ ...current, yRange: { minimum, maximum } }));
	}

	function resetView() {
		setFrozenLatest(null);
		changeSettings((current) => ({
			...current,
			windowSeconds: 60,
			endOffsetSeconds: 0,
			tickSeconds: null,
			yRange: null,
		}));
		setAxisError("");
	}

	const toolbarActions = (
		<>
		<button
			type="button"
			className={styles.settingsTrigger}
			aria-expanded={settingsOpen}
			aria-controls={settingsId}
			onClick={openSettings}
		>
			{settingsOpen ? "Close" : "Settings"}
		</button>
		{onRemove && <button type="button" className={styles.settingsTrigger} onClick={onRemove} aria-label={`Remove ${title}`} title={`Remove ${title}`}>×</button>}
		</>
	);

	return (
		<ModuleFrame
			title={title}
			status="idle"
			statusLabel="Demo"
			actions={toolbarActions}
			className={isAffected ? "affected-module" : ""}
		>
			<div className={styles.graphModule}>
				<div className={styles.toolbar}>
					<span>
						{selectedSeries.length}/{availableSeries.length} CHANNELS ·{" "}
						{settings.windowSeconds}s ·{" "}
						{frozenLatest === null ? "FOLLOW" : "PAUSED"}
					</span>
					{mixedUnits && (
						<span title="Selected channels have different units and share a single Y-axis">
							MIXED UNITS
						</span>
					)}
					<div className={styles.graphActions}>
						<button
							type="button"
							title="Pan back in time"
							aria-label="Pan time left"
							onClick={() => panX(0.25)}
						>
							←
						</button>
						<button
							type="button"
							title="Pan toward latest time"
							aria-label="Pan time right"
							onClick={() => panX(-0.25)}
						>
							→
						</button>
						<button
							type="button"
							title="Zoom into time"
							aria-label="Zoom time in"
							onClick={() => zoomX(0.8)}
						>
							+
						</button>
						<button
							type="button"
							title="Zoom out of time"
							aria-label="Zoom time out"
							onClick={() => zoomX(1.25)}
						>
							−
						</button>
					</div>
				</div>
				<div className={styles.plots}>
					<GraphPlot
						series={selectedSeries}
						scale={scale}
						startTime={viewStart}
						endTime={viewEnd}
						latestTime={latestTimestamp}
						tickSeconds={settings.tickSeconds}
						onVerticalPan={(fraction) =>
							updateYRange((range) => panYRange(range, fraction))
						}
						onVerticalZoom={(factor) =>
							updateYRange((range) => zoomYRange(range, factor))
						}
						onHorizontalPan={panX}
						onHorizontalZoom={zoomX}
					/>
				</div>
				<div className={styles.hint}>
					Scroll/drag: Y pan · Shift+scroll: time pan · Ctrl+scroll: Y zoom ·
					Alt+scroll: time zoom
				</div>
				{settingsOpen && (
					<aside
						id={settingsId}
						className={styles.settingsPanel}
						aria-label="Graph settings"
					>
						<div className={styles.settingsHeading}>
							<strong>Graph settings</strong>
							<button
								type="button"
								onClick={openSettings}
								aria-label="Close graph settings"
							>
								×
							</button>
						</div>
						<fieldset className={styles.settingsGroup}>
							<legend>X-axis & time</legend>
							<label>
								Time window (seconds)
								<NumberSetting
									key={`window-${settings.windowSeconds}`}
									value={settings.windowSeconds}
									min={MIN_WINDOW_SECONDS}
									max={MAX_WINDOW_SECONDS}
									onCommit={(value) => {
										if (value !== null)
											changeSettings((current) => ({
												...current,
												windowSeconds: value,
											}));
									}}
								/>
							</label>
							<label>
								End offset (seconds before newest)
								<NumberSetting
									key={`offset-${settings.endOffsetSeconds}`}
									value={settings.endOffsetSeconds}
									min={0}
									max={MAX_OFFSET_SECONDS}
									onCommit={(value) => {
										if (value !== null)
											changeSettings((current) => ({
												...current,
												endOffsetSeconds: value,
											}));
									}}
								/>
							</label>
							<label>
								X tick interval (seconds, blank = auto)
								<NumberSetting
									key={`ticks-${settings.tickSeconds ?? "auto"}`}
									value={settings.tickSeconds}
									min={1}
									max={MAX_WINDOW_SECONDS}
									placeholder="Auto"
									onCommit={(value) =>
										changeSettings((current) => ({
											...current,
											tickSeconds: value,
										}))
									}
								/>
							</label>
							<p className={styles.helperText}>
								Very dense tick intervals are thinned to keep labels legible.
							</p>
							<div className={styles.buttonRow}>
								<button
									type="button"
									onClick={() =>
										setFrozenLatest((current) =>
											current === null ? latestTimestamp : null,
										)
									}
								>
									{frozenLatest === null
										? "Pause X-axis"
										: "Resume live X-axis"}
								</button>
								<button type="button" onClick={() => panX(0.5)}>
									Earlier
								</button>
								<button type="button" onClick={() => panX(-0.5)}>
									Later
								</button>
							</div>
						</fieldset>
						<fieldset className={styles.settingsGroup}>
							<legend>Y-axis & vertical scroll</legend>
							<div className={styles.buttonRow}>
								<button
									type="button"
									onClick={() => updateYRange((range) => panYRange(range, 0.2))}
								>
									Pan up
								</button>
								<button
									type="button"
									onClick={() =>
										updateYRange((range) => panYRange(range, -0.2))
									}
								>
									Pan down
								</button>
								<button
									type="button"
									onClick={() =>
										updateYRange((range) => zoomYRange(range, 0.8))
									}
								>
									Zoom in
								</button>
								<button
									type="button"
									onClick={() =>
										updateYRange((range) => zoomYRange(range, 1.25))
									}
								>
									Zoom out
								</button>
							</div>
							<form
								className={styles.yForm}
								onSubmit={(event) => {
									event.preventDefault();
									applyYLimits();
								}}
							>
								<label>
									Y minimum
									<input
										type="number"
										step="any"
										value={yMinimumDraft}
										onChange={(event) => setYMinimumDraft(event.target.value)}
									/>
								</label>
								<label>
									Y maximum
									<input
										type="number"
										step="any"
										value={yMaximumDraft}
										onChange={(event) => setYMaximumDraft(event.target.value)}
									/>
								</label>
								<button type="submit">Apply limits</button>
							</form>
							{axisError && (
								<p className={styles.error} role="alert">
									{axisError}
								</p>
							)}
							<button
								type="button"
								onClick={() => {
									setYMinimumDraft(String(scale.minimum));
									setYMaximumDraft(String(scale.maximum));
								}}
							>
								Use current Y limits
							</button>
							<button
								type="button"
								onClick={() => {
									changeSettings((current) => ({ ...current, yRange: null }));
									setYMinimumDraft(String(autoScale.minimum));
									setYMaximumDraft(String(autoScale.maximum));
									setAxisError("");
								}}
							>
								Auto-fit Y (include zero)
							</button>
						</fieldset>
						<fieldset className={styles.settingsGroup}>
							<legend>Measurements & traces</legend>
							<div className={styles.buttonRow}>
								<button
									type="button"
									onClick={() =>
										changeSettings((current) => ({
											...current,
											channels: Object.fromEntries(
												availableSeries.map((entry, index) => [
													entry.channel,
													{
														...defaultChannelSettings(entry, index),
														...current.channels[entry.channel],
														visible: true,
													},
												]),
											),
										}))
									}
								>
									Show all
								</button>
								<button
									type="button"
									onClick={() =>
										changeSettings((current) => ({
											...current,
											channels: Object.fromEntries(
												availableSeries.map((entry, index) => [
													entry.channel,
													{
														...defaultChannelSettings(entry, index),
														...current.channels[entry.channel],
														visible: false,
													},
												]),
											),
										}))
									}
								>
									Hide all
								</button>
								<button
									type="button"
									onClick={() =>
										changeSettings((current) => ({
											...current,
											channels: Object.fromEntries(
												availableSeries.map((entry, index) => [
													entry.channel,
													{
														...defaultChannelSettings(entry, index),
														color: GRAPH_PALETTE[index % GRAPH_PALETTE.length],
													},
												]),
											),
										}))
									}
								>
									Restore trace defaults
								</button>
							</div>
							<div className={styles.measurements}>
								{availableSeries.map((current, index) => {
									const style = {
										...defaultChannelSettings(current, index),
										...settings.channels[current.channel],
									};
									return (
										<div
											key={current.channel}
											className={styles.measurementRow}
										>
											<label
												className={styles.channelToggle}
												title={`${current.channel} (${current.unit})`}
											>
												<input
													type="checkbox"
													checked={style.visible}
													onChange={(event) =>
														setChannel(current, index, {
															visible: event.target.checked,
														})
													}
												/>
												<span>
													{current.channel} <small>({current.unit})</small>
												</span>
											</label>
											<label className={styles.inlineField}>
												Color
												<input
													type="color"
													value={style.color}
													title={`Color for ${current.channel}`}
													onChange={(event) =>
														setChannel(current, index, {
															color: event.target.value,
														})
													}
												/>
											</label>
											<label className={styles.inlineField}>
												Line
												<select
													value={style.lineStyle}
													onChange={(event) =>
														setChannel(current, index, {
															lineStyle: event.target.value as GraphLineStyle,
														})
													}
												>
													{LINE_STYLES.map((lineStyle) => (
														<option
															key={lineStyle.value}
															value={lineStyle.value}
														>
															{lineStyle.label}
														</option>
													))}
												</select>
											</label>
										</div>
									);
								})}
							</div>
						</fieldset>
						<div className={styles.settingsFooter}>
							<button type="button" onClick={resetView}>
								Reset view
							</button>
							<span>Chart preferences save in this browser.</span>
						</div>
					</aside>
				)}
			</div>
		</ModuleFrame>
	);
});
