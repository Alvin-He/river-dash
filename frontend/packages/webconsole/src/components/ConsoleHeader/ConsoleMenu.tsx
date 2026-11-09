import { useEffect, useId, useRef, useState } from "react";
import styles from "./ConsoleMenu.module.css";

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
	/** Disable the menu shortcut while an access-management modal owns focus. */
	shortcutEnabled?: boolean;
}

/** Shortcuts must not interfere with operators typing into controls. */
function isTextEditingTarget(target: EventTarget | null): boolean {
	return target instanceof Element && Boolean(target.closest(
		'input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]',
	));
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
	shortcutEnabled = true,
}: ConsoleMenuProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [buttonVisible, setButtonVisible] = useState(true);
	const [buttonInteractive, setButtonInteractive] = useState(true);
	const rootRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const menuId = useId();
	const isViewer = accessRole === "viewer";
	const canEditLayout = !isViewer && Boolean(onToggleLock);

	// This shortcut always works, even when the floating icon is hidden or
	// disabled. The user can recover the menu using Shift+M (or reload the page).
	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (!shortcutEnabled) return;
			if (event.key === "Escape" && isOpen) {
				setIsOpen(false);
				if (buttonVisible && buttonInteractive) buttonRef.current?.focus();
				return; // Do not cancel the browser's Escape/fullscreen behavior.
			}
			if (
				event.key.toLowerCase() !== "m" || !event.shiftKey ||
				event.altKey || event.ctrlKey || event.metaKey || event.repeat ||
				isTextEditingTarget(event.target)
			) return;
			event.preventDefault();
			setIsOpen((open) => !open);
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isOpen, buttonVisible, buttonInteractive, shortcutEnabled]);

	useEffect(() => {
		if (!isOpen || !shortcutEnabled) return;
		panelRef.current?.focus();
		function onPointerDown(event: PointerEvent) {
			if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
				setIsOpen(false);
			}
		}
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [isOpen, shortcutEnabled]);

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
					title={buttonInteractive ? "Console menu (Shift+M)" : "Menu button disabled — use Shift+M"}
					onClick={() => setIsOpen((open) => !open)}
				>
					<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
						{isOpen ? <path d="M5 5l14 14M19 5L5 19" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
					</svg>
				</button>
			)}

			{isOpen && shortcutEnabled && (
				<div id={menuId} ref={panelRef} className={styles.panel} role="dialog" aria-label="Console menu" tabIndex={-1}>
					<div className={styles.panelHeading}>
						<div>
							<strong>NILE CONSOLE</strong>
							<span className={styles.subheading}>RIVER DASH / TEST CONSOLE</span>
						</div>
						<kbd>Shift+M</kbd>
					</div>
					{(accessRole || statusLabel) && (
						<div className={styles.context}>
							{accessRole && <span>{isViewer ? "VIEW ONLY" : "LOCAL OPERATOR"}</span>}
							{statusLabel && <span>{statusLabel}</span>}
						</div>
					)}

					<div className={styles.group}>
						<span className={styles.groupTitle}>Dashboard</span>
						{canEditLayout && (
							<>
								<button type="button" className={styles.item} onClick={() => runAction(onToggleLock!)}>
									<span>{isLocked ? "Edit layout" : "Lock layout"}</span>
									<span className={styles.itemNote}>{isLocked ? "Locked" : "Editing"}</span>
								</button>
								{onResetLayout && (
									<button type="button" className={styles.item} disabled={isLocked} title={isLocked ? "Unlock the layout to reset it" : "Restore the default module arrangement"} onClick={() => runAction(onResetLayout)}>
										Reset layout
									</button>
								)}
							</>
						)}
						<button type="button" className={styles.item} disabled={!fullscreenSupported} onClick={() => runAction(onToggleFullscreen)}>
							{isFullscreen ? "Exit full screen" : "Full screen"}
						</button>
					</div>

					{(onManageAccounts && !isViewer || onSignOut) && (
						<div className={styles.group}>
							<span className={styles.groupTitle}>Account & access</span>
							{onManageAccounts && !isViewer && (
								<button type="button" className={styles.item} onClick={() => runAction(onManageAccounts)}>Viewer management</button>
							)}
							{onSignOut && (
								<button type="button" className={styles.item} disabled={signingOut} onClick={() => runAction(onSignOut)}>
									{signingOut ? "Signing out…" : "Sign out"}
								</button>
							)}
						</div>
					)}

					<div className={styles.group}>
						<span className={styles.groupTitle}>Menu button</span>
						<label className={styles.preference}>
							<input type="checkbox" checked={buttonVisible} onChange={(event) => setButtonVisible(event.currentTarget.checked)} />
							<span>Show floating icon</span>
						</label>
						<label className={styles.preference}>
							<input type="checkbox" checked={buttonInteractive} onChange={(event) => setButtonInteractive(event.currentTarget.checked)} />
							<span>Allow icon clicks</span>
						</label>
						<p className={styles.hint}>Shift+M opens this menu even when the icon is hidden or disabled. These options reset when the page reloads.</p>
					</div>
				</div>
			)}
			{fullscreenError && <p className={styles.error} role="alert">{fullscreenError}</p>}
		</div>
	);
}
