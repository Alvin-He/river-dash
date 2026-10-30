import styles from "./ConsoleHeader.module.css";

interface ConsoleHeaderProps {
	isLocked: boolean;
	isFullscreen: boolean;
	fullscreenSupported: boolean;
	fullscreenError: string;
	onToggleFullscreen: () => void;
	onToggleLock: () => void;
	onResetLayout: () => void;
	onSignOut: () => void;
}

/** Displays console identity, the layout lock, and the existing status label. */
export function ConsoleHeader({
	isLocked,
	isFullscreen,
	fullscreenSupported,
	fullscreenError,
	onToggleFullscreen,
	onToggleLock,
	onResetLayout,
	onSignOut,
}: ConsoleHeaderProps) {
	return (
		<header className={styles.topbar}>
			<div className={styles.brand}>
				<span>N</span>
				<b>NILE CONSOLE</b>
				<small>TS-01 / SOUTH PAD</small>
			</div>
			<button className={styles.resetLayout} onClick={onResetLayout} disabled={isLocked} title="Restore the default module arrangement">Reset layout</button>
			<button className={styles.layoutLock} onClick={onToggleLock}>
				{isLocked ? "Edit layout" : "Lock layout"}
			</button>
			<p className={styles.connection}>● LIVE · 24.8 Hz</p>
			<button
				className={styles.fullscreen}
				type="button"
				onClick={onToggleFullscreen}
				disabled={!fullscreenSupported}
				aria-pressed={isFullscreen}
				title={
					!fullscreenSupported
						? "Fullscreen is not supported by this browser"
						: isFullscreen
							? "Return to windowed mode (Esc)"
							: "Expand dashboard to fullscreen"
				}
			>
				{isFullscreen ? "Exit full screen" : "Full screen"}
			</button>
			<button className={styles.signOut} onClick={onSignOut}>Sign out</button>
			{fullscreenError && (
				<p className={styles.fullscreenError} role="alert">{fullscreenError}</p>
			)}
		</header>
	);
}
