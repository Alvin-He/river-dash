import styles from "./ConsoleHeader.module.css";

interface ConsoleHeaderProps {
	isLocked: boolean;
	onToggleLock: () => void;
	onResetLayout: () => void;
	onSignOut: () => void;
}

/** Displays console identity, the layout lock, and the existing status label. */
export function ConsoleHeader({ isLocked, onToggleLock, onResetLayout, onSignOut }: ConsoleHeaderProps) {
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
			<button className={styles.signOut} onClick={onSignOut}>Sign out</button>
		</header>
	);
}
