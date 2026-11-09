import { useEffect, useId, useRef, useState } from "react";
import styles from "./ConsoleMenu.module.css";
import type { LayoutConfiguration } from "../../layout/layoutConfigurations";
import type { RepeatableModuleKind } from "../../layout/dashboardLayout";
import type { ManagedModule } from "../DashboardCanvas/DashboardCanvas";

/**
 * Navigation is a floating overlay, not a header: it must never consume module
 * layout space. Optional actions let frontend-auth supply its role-aware
 * controls later without introducing an authentication dependency here.
 */
export interface ConsoleMenuProps {
	isLocked: boolean;
	isFullscreen: boolean;
	fullscreenSupported: boolean;
	fullscreenError: string;
	onToggleFullscreen: () => void;
	onToggleLock?: () => void;
	onResetLayout?: () => void;
	onManageAccounts?: () => void;
	onSignOut?: () => void;
	accessRole?: "operator" | "viewer";
	statusLabel?: string;
	signingOut?: boolean;
	layoutConfigurations?: LayoutConfiguration[];
	layoutMessage?: { type: "success" | "error"; text: string } | null;
	onSaveConfiguration?: (name: string) => boolean;
	onLoadConfiguration?: (id: string) => boolean;
	onDeleteConfiguration?: (id: string) => void;
	onExportConfiguration?: (id: string) => void;
	onImportConfiguration?: (file: File) => Promise<void>;
	managedModules?: ManagedModule[];
	onAddModule?: (kind: RepeatableModuleKind) => boolean;
	onRemoveModule?: (id: string) => boolean;
}

/** Shortcuts must not interfere with operators typing into controls. */
function isTextEditingTarget(target: EventTarget | null): boolean {
	return (
		target instanceof Element &&
		Boolean(
			target.closest(
				'input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]',
			),
		)
	);
}

export function ConsoleMenu({
	isLocked,
	isFullscreen,
	fullscreenSupported,
	fullscreenError,
	onToggleFullscreen,
	onToggleLock,
	onResetLayout,
	onManageAccounts,
	onSignOut,
	accessRole,
	statusLabel,
	signingOut = false,
	layoutConfigurations = [],
	layoutMessage,
	onSaveConfiguration,
	onLoadConfiguration,
	onDeleteConfiguration,
	onExportConfiguration,
	onImportConfiguration,
	managedModules = [],
	onAddModule,
	onRemoveModule,
}: ConsoleMenuProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [buttonVisible, setButtonVisible] = useState(true);
	const [buttonInteractive, setButtonInteractive] = useState(true);
	const [layoutName, setLayoutName] = useState("");
	const fileRef = useRef<HTMLInputElement>(null);
	const layoutNameId = useId();
	const rootRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const menuId = useId();
	const isViewer = accessRole === "viewer";
	const canEditLayout = !isViewer && Boolean(onToggleLock);
	const canManageLayouts =
		!isViewer && Boolean(onSaveConfiguration && onLoadConfiguration);
	const canManageModules = !isViewer && Boolean(onAddModule && onRemoveModule);

	// This shortcut always works, even when the floating icon is hidden or
	// disabled. The user can recover the menu using Shift+M (or reload the page).
	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape" && isOpen) {
				setIsOpen(false);
				if (buttonVisible && buttonInteractive) buttonRef.current?.focus();
				return; // Do not cancel the browser's Escape/fullscreen behavior.
			}
			if (
				event.key.toLowerCase() !== "m" ||
				!event.shiftKey ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				event.repeat ||
				isTextEditingTarget(event.target)
			)
				return;
			event.preventDefault();
			setIsOpen((open) => !open);
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isOpen, buttonVisible, buttonInteractive]);

	useEffect(() => {
		if (!isOpen) return;
		panelRef.current?.focus();
		function onPointerDown(event: PointerEvent) {
			if (
				event.target instanceof Node &&
				!rootRef.current?.contains(event.target)
			) {
				setIsOpen(false);
			}
		}
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [isOpen]);

	function runAction(action: () => void) {
		setIsOpen(false);
		action();
	}

	return (
		<div ref={rootRef} className={styles.root}>
			{buttonVisible && (
				<button
					ref={buttonRef}
					className={styles.trigger}
					type="button"
					disabled={!buttonInteractive}
					aria-label="Toggle console menu (Shift+M)"
					aria-controls={menuId}
					aria-expanded={isOpen}
					title={
						buttonInteractive
							? "Console menu (Shift+M)"
							: "Menu button disabled — use Shift+M"
					}
					onClick={() => setIsOpen((open) => !open)}
				>
					<svg
						viewBox="0 0 24 24"
						width="20"
						height="20"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						aria-hidden="true"
					>
						{isOpen ? (
							<path d="M5 5l14 14M19 5L5 19" />
						) : (
							<path d="M4 6h16M4 12h16M4 18h16" />
						)}
					</svg>
				</button>
			)}

			{isOpen && (
				<div
					id={menuId}
					ref={panelRef}
					className={styles.panel}
					role="dialog"
					aria-label="Console menu"
					tabIndex={-1}
				>
					<div className={styles.panelHeading}>
						<div>
							<strong>NILE CONSOLE</strong>
							<span className={styles.subheading}>TS-01 / SOUTH PAD</span>
						</div>
						<kbd>Shift+M</kbd>
					</div>
					{(accessRole || statusLabel) && (
						<div className={styles.context}>
							{accessRole && (
								<span>{isViewer ? "VIEW ONLY" : "LOCAL OPERATOR"}</span>
							)}
							{statusLabel && <span>{statusLabel}</span>}
						</div>
					)}

					<div className={styles.group}>
						<span className={styles.groupTitle}>Dashboard</span>
						{canEditLayout && (
							<>
								<button
									type="button"
									className={styles.item}
									onClick={() => runAction(onToggleLock!)}
								>
									<span>{isLocked ? "Edit layout" : "Lock layout"}</span>
									<span className={styles.itemNote}>
										{isLocked ? "Locked" : "Editing"}
									</span>
								</button>
								{onResetLayout && (
									<button
										type="button"
										className={styles.item}
										disabled={isLocked}
										title={
											isLocked
												? "Unlock the layout to reset it"
												: "Restore the default module arrangement"
										}
										onClick={() => runAction(onResetLayout)}
									>
										Reset layout
									</button>
								)}
							</>
						)}
						<button
							type="button"
							className={styles.item}
							disabled={!fullscreenSupported}
							onClick={() => runAction(onToggleFullscreen)}
						>
							{isFullscreen ? "Exit full screen" : "Full screen"}
						</button>
					</div>

					{canManageModules && (
						<div className={styles.group}>
							<span className={styles.groupTitle}>Modules</span>
							<div className={styles.moduleAddRow}>
								<button type="button" className={styles.smallButton} disabled={isLocked}
									onClick={() => { if (onAddModule?.("graphs")) setIsOpen(false); }}>
									+ Time series graph
								</button>
								<button type="button" className={styles.smallButton} disabled={isLocked}
									onClick={() => { if (onAddModule?.("telemetry")) setIsOpen(false); }}>
									+ Telemetry overview
								</button>
							</div>
							{managedModules.length ? (
								<ul className={styles.savedList} aria-label="Graph and telemetry modules">
									{managedModules.map((module) => (
										<li key={module.id} className={styles.savedItem}>
											<span className={styles.savedName}>{module.label}</span>
											<button type="button" className={styles.smallButton} disabled={isLocked}
												aria-label={`Remove ${module.label}`} onClick={() => onRemoveModule?.(module.id)}>
												Remove
											</button>
										</li>
									))}
								</ul>
							) : <p className={styles.hint}>No graph or telemetry modules. Add one above.</p>}
							{isLocked && <p className={styles.hint}>Unlock layout editing to add or remove modules.</p>}
						</div>
					)}

					{canManageLayouts && (
						<div className={styles.group}>
							<span className={styles.groupTitle}>Saved layouts</span>
							<form
								className={styles.saveForm}
								onSubmit={(event) => {
									event.preventDefault();
									if (onSaveConfiguration?.(layoutName)) setLayoutName("");
								}}
							>
								<label htmlFor={layoutNameId} className={styles.fieldLabel}>
									Configuration name
								</label>
								<div className={styles.saveRow}>
									<input
										id={layoutNameId}
										className={styles.nameInput}
										value={layoutName}
										maxLength={48}
										onChange={(event) =>
											setLayoutName(event.currentTarget.value)
										}
										placeholder="e.g. Pre-test"
									/>
									<button type="submit" className={styles.smallButton}>
										Save
									</button>
								</div>
							</form>
							{layoutConfigurations.length > 0 ? (
								<ul
									className={styles.savedList}
									aria-label="Saved layout configurations"
								>
									{layoutConfigurations.map((configuration) => (
										<li key={configuration.id} className={styles.savedItem}>
											<span
												className={styles.savedName}
												title={configuration.name}
											>
												{configuration.name}
											</span>
											<div className={styles.savedActions}>
												<button
													type="button"
													className={styles.smallButton}
													disabled={isLocked}
													title={
														isLocked
															? "Unlock layout editing before loading"
															: `Load ${configuration.name}`
													}
													onClick={() => {
														if (onLoadConfiguration?.(configuration.id))
															setIsOpen(false);
													}}
												>
													Load
												</button>
												{onExportConfiguration && (
													<button
														type="button"
														className={styles.smallButton}
														onClick={() =>
															onExportConfiguration(configuration.id)
														}
														title={`Export ${configuration.name} as JSON`}
													>
														Export
													</button>
												)}
												{onDeleteConfiguration && (
													<button
														type="button"
														className={styles.smallButton}
														onClick={() =>
															onDeleteConfiguration(configuration.id)
														}
														title={`Delete ${configuration.name}`}
													>
														Delete
													</button>
												)}
											</div>
										</li>
									))}
								</ul>
							) : (
								<p className={styles.hint}>
									No named layouts yet. The current layout still autosaves.
								</p>
							)}
							{onImportConfiguration && (
								<>
									<input
										ref={fileRef}
										type="file"
										accept=".json,application/json"
										className={styles.fileInput}
										onChange={(event) => {
											const file = event.currentTarget.files?.[0];
											if (file) void onImportConfiguration(file);
											event.currentTarget.value = "";
										}}
									/>
									<button
										type="button"
										className={styles.item}
										onClick={() => fileRef.current?.click()}
									>
										Import layout from JSON…
									</button>
								</>
							)}
							{isLocked && (
								<p className={styles.hint}>
									Unlock layout editing to load a configuration.
								</p>
							)}
							{layoutMessage && (
								<p
									className={
										layoutMessage.type === "error"
											? styles.messageError
											: styles.messageSuccess
									}
									role={layoutMessage.type === "error" ? "alert" : "status"}
								>
									{layoutMessage.text}
								</p>
							)}
						</div>
					)}

					{((onManageAccounts && !isViewer) || onSignOut) && (
						<div className={styles.group}>
							<span className={styles.groupTitle}>Account & access</span>
							{onManageAccounts && !isViewer && (
								<button
									type="button"
									className={styles.item}
									onClick={() => runAction(onManageAccounts)}
								>
									Viewer management
								</button>
							)}
							{onSignOut && (
								<button
									type="button"
									className={styles.item}
									disabled={signingOut}
									onClick={() => runAction(onSignOut)}
								>
									{signingOut ? "Signing out…" : "Sign out"}
								</button>
							)}
						</div>
					)}

					<div className={styles.group}>
						<span className={styles.groupTitle}>Menu button</span>
						<label className={styles.preference}>
							<input
								type="checkbox"
								checked={buttonVisible}
								onChange={(event) =>
									setButtonVisible(event.currentTarget.checked)
								}
							/>
							<span>Show floating icon</span>
						</label>
						<label className={styles.preference}>
							<input
								type="checkbox"
								checked={buttonInteractive}
								onChange={(event) =>
									setButtonInteractive(event.currentTarget.checked)
								}
							/>
							<span>Allow icon clicks</span>
						</label>
						<p className={styles.hint}>
							Shift+M opens this menu even when the icon is hidden or disabled.
							These options reset when the page reloads.
						</p>
					</div>
				</div>
			)}
			{fullscreenError && (
				<p className={styles.error} role="alert">
					{fullscreenError}
				</p>
			)}
		</div>
	);
}
