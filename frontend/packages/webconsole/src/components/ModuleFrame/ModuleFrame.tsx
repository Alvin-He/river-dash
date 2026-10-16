import type { ReactNode } from "react";
import styles from "./ModuleFrame.module.css";

export type ModuleStatus = "live" | "idle" | "warning" | "error";

interface ModuleFrameProps {
	children: ReactNode;
	title: string;
	status?: ModuleStatus;
	statusLabel?: string;
	actions?: ReactNode;
	className?: string;
}

/**
 * Shared visual shell for every dashboard module.
 *
 * The dashboard canvas controls positioning and resizing. Feature modules own
 * only their domain-specific content and render it inside this frame.
 */
export function ModuleFrame({
	children,
	title,
	status = "idle",
	statusLabel,
	actions,
	className = "",
}: ModuleFrameProps) {
	return (
		<section className={`${styles.module} ${className}`}>
			<header className={`${styles.header} drag-handle`}>
				<span className={styles.grip} aria-hidden="true">⠿</span>
				<h2>{title}</h2>
				{statusLabel && (
					<span className={`${styles.status} ${styles[status]}`}>
						{statusLabel}
					</span>
				)}
				{actions && <div className={styles.actions}>{actions}</div>}
			</header>
			<div className={styles.content}>{children}</div>
		</section>
	);
}
