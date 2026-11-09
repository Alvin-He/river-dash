import type { OperatingMode } from "../../controller/topics";
import type { AccessRole } from "../../auth/authApi";
import { BrandMark } from "../BrandMark/BrandMark";
import styles from "./ConsoleHeader.module.css";

interface ConsoleHeaderProps {
	role: AccessRole;
	standMode: OperatingMode | null;
	isLocked: boolean;
	isFullscreen: boolean;
	fullscreenSupported: boolean;
	fullscreenError: string;
	onToggleFullscreen: () => void;
	onToggleLock: () => void;
	onResetLayout: () => void;
	onManageAccounts: () => void;
	onSignOut: () => void;
	signingOut: boolean;
}

/** Keep operator-only actions separate from the remote read-only toolbar. */
export function ConsoleHeader({
	role,
	standMode,
	isLocked,
	isFullscreen,
	fullscreenSupported,
	fullscreenError,
	onToggleFullscreen,
	onToggleLock,
	onResetLayout,
	onManageAccounts,
	onSignOut,
	signingOut,
}: ConsoleHeaderProps) {
	const isOperator = role === "operator";
	return (
		<header className={styles.topbar}>
			<div className={styles.brand}>
				<span className={styles.brandMark} aria-hidden="true"><BrandMark /></span>
				<b>NILE CONSOLE</b>
				<small>RIVER DASH / TEST CONSOLE</small>
			</div>
			{isOperator && (
				<>
					<button className={styles.resetLayout} onClick={onResetLayout} disabled={isLocked} title="Restore the default module arrangement">Reset layout</button>
					<button className={styles.layoutLock} onClick={onToggleLock}>
						{isLocked ? "Edit layout" : "Lock layout"}
					</button>
					<button className={styles.manageAccounts} onClick={onManageAccounts}>Viewer management</button>
				</>
			)}
			<span className={styles.role} aria-label={isOperator ? "Local operator access" : "Remote view-only access"}>
				{isOperator ? "LOCAL OPERATOR" : "VIEW ONLY"}
			</span>
			<p className={styles.connection}>SIMULATION · NO HARDWARE · MODE: {standMode ?? "UNKNOWN"}</p>
			<button
				className={styles.fullscreen}
				type="button"
				onClick={onToggleFullscreen}
				disabled={!fullscreenSupported}
				aria-pressed={isFullscreen}
				title={!fullscreenSupported
					? "Fullscreen is not supported by this browser"
					: isFullscreen ? "Return to windowed mode (Esc)" : "Expand dashboard to fullscreen"}
			>
				{isFullscreen ? "Exit full screen" : "Full screen"}
			</button>
			{!isOperator && (
				<button className={styles.signOut} onClick={onSignOut} disabled={signingOut}>
					{signingOut ? "Signing out…" : "Sign out"}
				</button>
			)}
			{fullscreenError && <p className={styles.fullscreenError} role="alert">{fullscreenError}</p>}
		</header>
	);
}
